"""Tests for auth (register/login/refresh, JWT handling) and per-user data isolation."""
import unittest
from datetime import datetime, timedelta, timezone

import jwt

import app.config as config
from app.services.auth_service import create_access_token, create_refresh_token
from tests.helpers import ApiTestCase


class AuthTest(ApiTestCase):
    def test_register_login_and_me(self):
        res = self.client.post("/api/auth/login", json={"email": "alice@example.com", "password": "password123"})
        self.assertEqual(res.status_code, 200)
        headers = {"Authorization": f"Bearer {res.get_json()['access_token']}"}
        me = self.client.get("/api/auth/me", headers=headers).get_json()
        self.assertEqual(me["email"], "alice@example.com")
        self.assertNotIn("password_hash", me)

    def test_duplicate_email_and_weak_password_rejected(self):
        body = {"email": "alice@example.com", "password": "password123", "name": "X"}
        self.assertEqual(self.client.post("/api/auth/register", json=body).status_code, 409)
        body = {"email": "new@example.com", "password": "short", "name": "X"}
        self.assertEqual(self.client.post("/api/auth/register", json=body).status_code, 422)

    def test_wrong_password_is_rejected(self):
        res = self.client.post("/api/auth/login", json={"email": "alice@example.com", "password": "nope"})
        self.assertEqual(res.status_code, 401)

    def test_no_demo_admin_unless_enabled(self):
        res = self.client.post("/api/auth/login", json={"email": "admin@admin.com", "password": "admin123"})
        self.assertEqual(res.status_code, 401)

    def test_protected_endpoint_requires_token(self):
        self.assertEqual(self.client.get("/api/bills").status_code, 401)
        self.assertEqual(self.client.get("/api/bills", headers={"Authorization": "Bearer junk"}).status_code, 401)

    def test_refresh_token_cannot_be_used_as_access_token(self):
        token = create_refresh_token(1)
        res = self.client.get("/api/bills", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res.status_code, 401)

    def test_access_token_cannot_be_used_to_refresh(self):
        res = self.client.post("/api/auth/refresh", json={"refresh_token": create_access_token(1)})
        self.assertEqual(res.status_code, 401)

    def test_refresh_issues_working_access_token(self):
        login = self.client.post("/api/auth/login", json={"email": "alice@example.com", "password": "password123"})
        res = self.client.post("/api/auth/refresh", json={"refresh_token": login.get_json()["refresh_token"]})
        self.assertEqual(res.status_code, 200)
        headers = {"Authorization": f"Bearer {res.get_json()['access_token']}"}
        self.assertEqual(self.client.get("/api/bills", headers=headers).status_code, 200)

    def test_expired_token_is_rejected(self):
        payload = {"sub": 1, "type": "access", "exp": datetime.now(timezone.utc) - timedelta(seconds=5)}
        token = jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")
        res = self.client.get("/api/bills", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.get_json()["error"], "Token expired")

    def test_token_signed_with_another_secret_is_rejected(self):
        payload = {"sub": 1, "type": "access", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)}
        token = jwt.encode(payload, "some-other-secret-0123456789abcdef", algorithm="HS256")
        res = self.client.get("/api/bills", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res.status_code, 401)


class ConfigGuardTest(unittest.TestCase):
    def setUp(self):
        self._saved = (config.JWT_SECRET, config.DEBUG)

    def tearDown(self):
        config.JWT_SECRET, config.DEBUG = self._saved

    def test_default_secret_refused_outside_debug(self):
        config.JWT_SECRET, config.DEBUG = config.DEFAULT_JWT_SECRET, False
        with self.assertRaises(RuntimeError):
            config.check_secrets()

    def test_default_secret_allowed_in_debug(self):
        config.JWT_SECRET, config.DEBUG = config.DEFAULT_JWT_SECRET, True
        config.check_secrets()

    def test_custom_secret_allowed_outside_debug(self):
        config.JWT_SECRET, config.DEBUG = "a-long-random-secret-value-1234567890", False
        config.check_secrets()


class UserIsolationTest(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.bob_headers = self.register("bob@example.com")
        self.bill, self.items, self.people = self.make_bill(
            items=[{"name": "Soup", "unit_price": 9}])

    def test_other_user_cannot_see_or_change_the_bill(self):
        h, bid = self.bob_headers, self.bill["id"]
        self.assertEqual(self.client.get("/api/bills", headers=h).get_json(), [])
        self.assertEqual(self.client.get(f"/api/bills/{bid}", headers=h).status_code, 404)
        self.assertEqual(self.client.patch(f"/api/bills/{bid}", json={"name": "x"}, headers=h).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/bills/{bid}", headers=h).status_code, 404)
        self.assertEqual(self.client.get(f"/api/bills/{bid}/items", headers=h).status_code, 404)
        self.assertEqual(self.client.get(f"/api/bills/{bid}/persons", headers=h).status_code, 404)
        self.assertEqual(self.client.get(f"/api/bills/{bid}/results", headers=h).status_code, 404)
        self.assertEqual(self.client.post(f"/api/bills/{bid}/calculate", headers=h).status_code, 404)

    def test_other_user_cannot_touch_items_persons_or_assignments(self):
        h = self.bob_headers
        item_id, person_id = self.items[0]["id"], self.people[0]["id"]
        self.assertEqual(self.client.patch(f"/api/items/{item_id}", json={"name": "x"}, headers=h).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/items/{item_id}", headers=h).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/persons/{person_id}", headers=h).status_code, 404)
        res = self.client.put(f"/api/items/{item_id}/assignments",
                              json={"assignments": [{"person_id": person_id}]}, headers=h)
        self.assertEqual(res.status_code, 404)
        # Still intact for the owner.
        bill = self.client.get(f"/api/bills/{self.bill['id']}", headers=self.headers).get_json()
        self.assertEqual(bill["items"][0]["name"], "Soup")

    def test_other_user_cannot_attach_own_item_to_foreign_person(self):
        # Bob builds a bill of his own and tries to assign Alice's person to his item.
        _, bob_items, _ = self.make_bill(headers=self.bob_headers, items=[{"name": "Tea", "unit_price": 3}])
        res = self.client.put(f"/api/items/{bob_items[0]['id']}/assignments",
                              json={"assignments": [{"person_id": self.people[0]["id"]}]},
                              headers=self.bob_headers)
        self.assertEqual(res.status_code, 404)


if __name__ == "__main__":
    unittest.main()
