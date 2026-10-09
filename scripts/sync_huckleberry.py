"""Read-only Huckleberry snapshot sync. Never prints secrets or patient records."""
import asyncio
import os
from urllib.parse import urlsplit, urlunsplit
from datetime import datetime, timezone
import aiohttp
from huckleberry_api import HuckleberryAPI

def serialize(value):
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if isinstance(value, (list, tuple)):
        return [serialize(x) for x in value]
    if isinstance(value, dict):
        return {str(k): serialize(v) for k, v in value.items()}
    return value

def child_name(child):
    for key in ("childsName", "nickname"):
        value = getattr(child, key, None)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None

async def select_child(api, children, selected=None, selected_name=None):
    if not children:
        raise RuntimeError("No Huckleberry child profiles found.")
    if selected:
        matches = [child for child in children if child.cid == selected]
        if len(matches) != 1:
            raise RuntimeError("Configured child UID not found.")
        return matches[0]
    if selected_name:
        normalized = selected_name.strip().casefold()
        matches = []
        for child in children:
            # 0.4.7 stores the display name in childs/{cid}.childsName.
            # childList contains references with an optional nickname.
            profile = await api.get_child(child.cid)
            name = child_name(profile) or child_name(child)
            if name and name.casefold() == normalized:
                matches.append(child)
        if len(matches) != 1:
            raise RuntimeError("Configured child name did not uniquely match a Huckleberry profile.")
        return matches[0]
    if len(children) == 1:
        return children[0]
    raise RuntimeError("Multiple child profiles found. Set HUCKLEBERRY_CHILD_NAME or HUCKLEBERRY_CHILD_UID to prevent mixing records.")

def sync_endpoint(base_url):
    url = urlsplit(base_url)
    endpoint = "/api/integrations/huckleberry"
    if (url.scheme != "https" or not url.hostname or url.username or url.password
            or url.query or url.fragment or url.path.rstrip("/") not in ("", endpoint)):
        raise RuntimeError("ZADE_SYNC_URL must be an HTTPS deployment origin or the Huckleberry endpoint, without credentials or query parameters.")
    return urlunsplit((url.scheme, url.netloc, endpoint, "", ""))

def response_failure(status, headers):
    # Never include response bodies, redirect URLs, tokens, or patient records.
    if headers.get("x-zade-auth-layer") == "sync-token":
        if status == 401:
            return "Application ZADE_SYNC_TOKEN validation rejected the request. Check the GitHub secret and the deployed Preview branch environment."
        if status == 503:
            return "Application sync configuration is unavailable. Check ZADE_SYNC_TOKEN (32+ characters) and DATABASE_URL."
        return "Application Huckleberry endpoint rejected the request (HTTP " + str(status) + ")."
    if status in (301, 302, 303, 307, 308):
        return "Request redirected before reaching the sync endpoint. Check Neon Auth proxy exclusions and the deployment URL."
    if status in (401, 403):
        return "Request rejected before reaching the sync endpoint (HTTP " + str(status) + "). Check Vercel Deployment Protection, the linked GitHub repository, and the fresh GitHub OIDC token."
    return "Zade sync endpoint returned HTTP " + str(status) + "."

async def check_response(response):
    if response.status != 200:
        raise RuntimeError(response_failure(response.status, response.headers))
    # A sign-in page can return 200; require the endpoint's explicit marker.
    if response.headers.get("x-zade-auth-layer") != "sync-token":
        raise RuntimeError("Response did not come from the Huckleberry sync endpoint. Check deployment readiness and the URL.")
    try:
        result = await response.json()
    except (ValueError, aiohttp.ContentTypeError):
        raise RuntimeError("Sync endpoint did not return a JSON acknowledgment.") from None
    if not isinstance(result, dict) or result.get("ok") is not True:
        raise RuntimeError("Sync endpoint did not acknowledge the request.")

async def main():
    required = ["HUCKLEBERRY_EMAIL", "HUCKLEBERRY_PASSWORD", "ZADE_SYNC_URL", "ZADE_SYNC_TOKEN"]
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise RuntimeError("Missing required secrets: " + ", ".join(missing))
    endpoint = sync_endpoint(os.environ["ZADE_SYNC_URL"])
    headers = {"Authorization": "Bearer " + os.environ["ZADE_SYNC_TOKEN"]}
    if os.getenv("VERCEL_OIDC_TOKEN"):
        headers["x-vercel-trusted-oidc-idp-token"] = os.environ["VERCEL_OIDC_TOKEN"]
    elif os.getenv("GITHUB_ACTIONS") == "true":
        raise RuntimeError("GitHub Actions requires a fresh VERCEL_OIDC_TOKEN for Deployment Protection.")
    async with aiohttp.ClientSession() as session:
        # Verify protection access and token agreement before reading baby data.
        async with session.get(endpoint, headers=headers, allow_redirects=False,
                               timeout=aiohttp.ClientTimeout(total=30)) as response:
            await check_response(response)
        print("Protected endpoint reached; GitHub and deployed ZADE_SYNC_TOKEN match.")
        api = HuckleberryAPI(
            email=os.environ["HUCKLEBERRY_EMAIL"],
            password=os.environ["HUCKLEBERRY_PASSWORD"],
            timezone="America/Los_Angeles",
            websession=session,
        )
        await api.authenticate()
        user = await api.get_user()
        if user is None:
            raise RuntimeError("Huckleberry user profile not found.")
        children = list(user.childList)
        selected = os.getenv("HUCKLEBERRY_CHILD_UID")
        selected_name = os.getenv("HUCKLEBERRY_CHILD_NAME")
        child = await select_child(api, children, selected, selected_name)
        sleep = await api.get_sleep(child.cid)
        nursing = await api.get_nursing(child.cid)
        growth = await api.get_latest_growth(child.cid)
        snapshot = {
            "source": "huckleberry",
            "childId": child.cid,
            "syncedAt": datetime.now(timezone.utc).isoformat(),
            "sleep": serialize(sleep),
            "nursing": serialize(nursing),
            "growth": serialize(growth),
        }
        async with session.post(
            endpoint,
            json=snapshot,
            headers=headers,
            allow_redirects=False,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as response:
            await check_response(response)
    print("Huckleberry read-only snapshot synced successfully.")

if __name__ == "__main__":
    asyncio.run(main())
