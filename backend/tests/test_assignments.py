"""Tests for PUT /items/<id>/assignments validation."""
import io
import unittest

from PIL import Image

from tests.helpers import ApiTestCase


class ReplaceAssignmentsTest(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.bill, self.items, self.people = self.make_bill(items=[
            {"name": "Soup", "unit_price": 9},
            {"name": "Tax", "unit_price": 1, "is_tax_line": True},
        ])
        self.url = f"/api/items/{self.items[0]['id']}/assignments"

    def _put(self, assignments):
        return self.client.put(self.url, json={"assignments": assignments}, headers=self.headers)

    def test_valid_replace_returns_rows(self):
        res = self._put([{"person_id": p["id"]} for p in self.people])
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.get_json()), 2)

    def test_replace_overwrites_previous_assignments(self):
        self._put([{"person_id": self.people[0]["id"]}, {"person_id": self.people[1]["id"]}])
        res = self._put([{"person_id": self.people[1]["id"]}])
        self.assertEqual([r["person_id"] for r in res.get_json()], [self.people[1]["id"]])

    def test_person_from_another_bill_is_rejected_and_nothing_changes(self):
        _, _, other_people = self.make_bill(people=("Zed",))
        self._put([{"person_id": self.people[0]["id"]}])
        res = self._put([{"person_id": other_people[0]["id"]}])
        self.assertEqual(res.status_code, 404)
        kept = self.client.get(f"/api/bills/{self.bill['id']}/assignments", headers=self.headers).get_json()
        self.assertEqual([a["person_id"] for a in kept], [self.people[0]["id"]])

    def test_unknown_person_is_404_not_500(self):
        self.assertEqual(self._put([{"person_id": 99999}]).status_code, 404)

    def test_malformed_person_id_is_rejected(self):
        for bad in ("abc", None, 1.5, True, [1]):
            with self.subTest(person_id=bad):
                self.assertEqual(self._put([{"person_id": bad}]).status_code, 422)

    def test_duplicate_person_is_rejected(self):
        pid = self.people[0]["id"]
        self.assertEqual(self._put([{"person_id": pid}, {"person_id": pid}]).status_code, 422)

    def test_split_value_is_validated(self):
        pid = self.people[0]["id"]
        for bad in (None, "ten", -5, True, float("inf")):
            with self.subTest(split_value=bad):
                res = self._put([{"person_id": pid, "split_type": "percentage", "split_value": bad}])
                self.assertEqual(res.status_code, 422)

    def test_equal_split_ignores_split_value(self):
        res = self._put([{"person_id": self.people[0]["id"], "split_value": 12}])
        self.assertIsNone(res.get_json()[0]["split_value"])

    def test_bad_shapes_are_rejected(self):
        self.assertEqual(self._put(["nope"]).status_code, 422)
        res = self.client.put(self.url, json={"assignments": "x"}, headers=self.headers)
        self.assertEqual(res.status_code, 422)

    def test_tax_line_cannot_be_assigned(self):
        res = self.client.put(f"/api/items/{self.items[1]['id']}/assignments",
                              json={"assignments": [{"person_id": self.people[0]["id"]}]}, headers=self.headers)
        self.assertEqual(res.status_code, 422)


class UpdateItemTest(ApiTestCase):
    def test_non_numeric_values_return_422(self):
        _, items, _ = self.make_bill(items=[{"name": "Soup", "unit_price": 9}])
        res = self.client.patch(f"/api/items/{items[0]['id']}", json={"quantity": "lots"}, headers=self.headers)
        self.assertEqual(res.status_code, 422)

    def test_total_is_recomputed(self):
        _, items, _ = self.make_bill(items=[{"name": "Soup", "unit_price": 9}])
        res = self.client.patch(f"/api/items/{items[0]['id']}", json={"quantity": 3}, headers=self.headers)
        self.assertEqual(res.get_json()["total_price"], 27.0)


class ImageUploadValidationTest(ApiTestCase):
    def _upload(self, data: bytes, name="bill.png"):
        bill, _, _ = self.make_bill(people=())
        return self.client.post("/api/ocr/upload", headers=self.headers, content_type="multipart/form-data",
                                data={"bill_id": str(bill["id"]), "file": (io.BytesIO(data), name)})

    def test_non_image_content_with_image_extension_is_rejected(self):
        res = self._upload(b"<?php echo 'not an image'; ?>")
        self.assertEqual(res.status_code, 422)

    def test_truncated_image_is_rejected(self):
        buf = io.BytesIO()
        Image.new("RGB", (50, 50), "white").save(buf, "PNG")
        self.assertEqual(self._upload(buf.getvalue()[:40]).status_code, 422)

    def test_wrong_extension_still_rejected_by_name(self):
        self.assertEqual(self._upload(b"x", name="bill.exe").status_code, 422)


if __name__ == "__main__":
    unittest.main()
