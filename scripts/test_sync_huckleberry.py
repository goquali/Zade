"""Offline regressions using the installed 0.4.7 models; no family data."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from huckleberry_api.firebase_types import FirebaseChildDocument, FirebaseUserChildRef
from sync_huckleberry import check_response, select_child, serialize, sync_endpoint


class ChildSelectionTests(unittest.IsolatedAsyncioTestCase):
    async def test_display_name_from_child_document(self):
        children = [FirebaseUserChildRef(cid="one", nickname="Alias"),
                    FirebaseUserChildRef(cid="two")]
        api = SimpleNamespace(get_child=AsyncMock(side_effect=[
            FirebaseChildDocument(childsName="Example"),
            FirebaseChildDocument(childsName="Other")]))
        child = await select_child(api, children, selected_name=" example ")
        self.assertEqual(child.cid, "one")

    async def test_nickname_fallback(self):
        child = FirebaseUserChildRef(cid="one", nickname="Example")
        api = SimpleNamespace(get_child=AsyncMock(return_value=None))
        self.assertEqual(await select_child(api, [child], selected_name="example"), child)

    async def test_duplicate_names_fail_closed(self):
        children = [FirebaseUserChildRef(cid="one"), FirebaseUserChildRef(cid="two")]
        api = SimpleNamespace(get_child=AsyncMock(return_value=FirebaseChildDocument(childsName="Example")))
        with self.assertRaisesRegex(RuntimeError, "uniquely"):
            await select_child(api, children, selected_name="Example")

    async def test_uid_is_explicit_and_does_not_fetch_names(self):
        children = [FirebaseUserChildRef(cid="one"), FirebaseUserChildRef(cid="two")]
        api = SimpleNamespace(get_child=AsyncMock())
        self.assertEqual((await select_child(api, children, selected="two")).cid, "two")
        api.get_child.assert_not_called()
        with self.assertRaisesRegex(RuntimeError, "UID"):
            await select_child(api, children, selected="missing")

    async def test_empty_and_ambiguous_profiles(self):
        api = SimpleNamespace()
        with self.assertRaisesRegex(RuntimeError, "No Huckleberry"):
            await select_child(api, [])
        with self.assertRaisesRegex(RuntimeError, "Multiple"):
            await select_child(api, [FirebaseUserChildRef(cid="one"), FirebaseUserChildRef(cid="two")])
        child = FirebaseUserChildRef(cid="one")
        self.assertEqual(await select_child(api, [child]), child)


class ResponseTests(unittest.IsolatedAsyncioTestCase):
    async def test_layers_and_unexpected_html(self):
        for status, headers, expected in [
            (401, {}, "Vercel Deployment Protection"),
            (401, {"x-zade-auth-layer": "sync-token"}, "ZADE_SYNC_TOKEN validation"),
            (503, {"x-zade-auth-layer": "sync-token"}, "configuration"),
            (307, {"Location": "https://private.invalid/?token=secret"}, "redirected"),
            (200, {}, "did not come from"),
        ]:
            with self.subTest(status=status, headers=headers):
                response = SimpleNamespace(status=status, headers=headers)
                with self.assertRaisesRegex(RuntimeError, expected) as result:
                    await check_response(response)
                self.assertNotIn("private.invalid", str(result.exception))
        response = SimpleNamespace(status=200, headers={"x-zade-auth-layer": "sync-token"},
                                   json=AsyncMock(return_value={"ok": True}))
        await check_response(response)
        response.json.return_value = {"ok": False}
        with self.assertRaisesRegex(RuntimeError, "acknowledge"):
            await check_response(response)


class ConfigurationTests(unittest.TestCase):
    def test_origin_and_full_endpoint(self):
        endpoint = "https://example.vercel.app/api/integrations/huckleberry"
        self.assertEqual(sync_endpoint("https://example.vercel.app/"), endpoint)
        self.assertEqual(sync_endpoint(endpoint + "/"), endpoint)
        for url in ["http://example.vercel.app", "https://user:pass@example.vercel.app",
                    endpoint + "?token=secret", "https://example.vercel.app/sign-in"]:
            with self.assertRaises(RuntimeError):
                sync_endpoint(url)

    def test_model_serialization_and_missing_document(self):
        self.assertEqual(serialize({"profile": FirebaseChildDocument(childsName="Example")})["profile"]["childsName"], "Example")
        self.assertIsNone(serialize(None))


if __name__ == "__main__":
    unittest.main()
