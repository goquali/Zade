"""Read-only Huckleberry snapshot sync. Never prints secrets or patient records."""
import asyncio
import json
import os
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
    for key in ("name", "firstName", "nickname"):
        value = getattr(child, key, None)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None

async def main():
    required = ["HUCKLEBERRY_EMAIL", "HUCKLEBERRY_PASSWORD", "ZADE_SYNC_URL", "ZADE_SYNC_TOKEN"]
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise RuntimeError("Missing required secrets: " + ", ".join(missing))
    async with aiohttp.ClientSession() as session:
        api = HuckleberryAPI(
            email=os.environ["HUCKLEBERRY_EMAIL"],
            password=os.environ["HUCKLEBERRY_PASSWORD"],
            timezone="America/Los_Angeles",
            websession=session,
        )
        await api.authenticate()
        user = await api.get_user()
        children = list(user.childList)
        selected = os.getenv("HUCKLEBERRY_CHILD_UID")
        selected_name = os.getenv("HUCKLEBERRY_CHILD_NAME")
        if selected:
            matches = [child for child in children if child.cid == selected]
            if len(matches) != 1:
                raise RuntimeError("Configured child UID not found.")
            child = matches[0]
        elif selected_name:
            normalized = selected_name.strip().casefold()
            matches = [child for child in children if child_name(child) and child_name(child).casefold() == normalized]
            if len(matches) != 1:
                raise RuntimeError("Configured child name did not uniquely match a Huckleberry profile.")
            child = matches[0]
        elif len(children) == 1:
            child = children[0]
        else:
            raise RuntimeError("Multiple child profiles found. Set HUCKLEBERRY_CHILD_NAME or HUCKLEBERRY_CHILD_UID to prevent mixing records.")
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
        headers = {"Authorization": "Bearer " + os.environ["ZADE_SYNC_TOKEN"]}
        if os.getenv("VERCEL_OIDC_TOKEN"):
            headers["x-vercel-trusted-oidc-idp-token"] = os.environ["VERCEL_OIDC_TOKEN"]
        async with session.post(
            os.environ["ZADE_SYNC_URL"].rstrip("/") + "/api/integrations/huckleberry",
            json=snapshot,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as response:
            if response.status != 200:
                raise RuntimeError("Zade sync endpoint returned HTTP " + str(response.status))
    print("Huckleberry read-only snapshot synced successfully.")

if __name__ == "__main__":
    asyncio.run(main())
