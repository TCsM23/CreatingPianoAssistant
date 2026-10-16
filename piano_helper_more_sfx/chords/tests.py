from django.test import TestCase
from django.urls import reverse

from .theory import TheoryError, identify_chord, identify_key


class IdentifyChordTests(TestCase):
    def test_c_major_triad_is_a_triad(self):
        chord = identify_chord([60, 64, 67])["chords"][0]
        self.assertEqual(chord["name"], "C")
        self.assertEqual(chord["kind"], "Triad")
        self.assertFalse(chord["inversion"])

    def test_seventh_chord_kind(self):
        chord = identify_chord([60, 64, 67, 70])["chords"][0]
        self.assertEqual(chord["name"], "C7")
        self.assertEqual(chord["kind"], "Seventh chord")

    def test_first_inversion_is_marked(self):
        chord = identify_chord([64, 67, 72])["chords"][0]
        self.assertEqual(chord["name"], "C/E")
        self.assertTrue(chord["inversion"])


class IdentifyKeyTests(TestCase):
    def names(self, notes):
        return [k["name"] for k in identify_key(notes)["keys"]]

    def test_c_major_scale_fits_c_major_and_a_minor(self):
        names = self.names([60, 62, 64, 65, 67, 69, 71])
        self.assertEqual(names[0], "C major")
        self.assertIn("A minor", names[:2])

    def test_f_sharp_points_to_g_major(self):
        result = identify_key([67, 71, 74, 66])  # G B D F#
        self.assertEqual(result["keys"][0]["name"], "G major")
        self.assertEqual(result["keys"][0]["signature"], "1 sharp: F#")

    def test_flat_keys_use_flat_names(self):
        key = identify_key([58, 62, 65, 63])["keys"][0]  # Bb D F Eb
        self.assertEqual(key["name"], "Bb major")
        self.assertEqual(key["signature"], "2 flats: Bb, Eb")

    def test_a_minor_with_a_bass_note_ranks_first(self):
        self.assertEqual(self.names([45, 48, 52])[0], "A minor")  # A C E, A in the bass

    def test_no_key_contains_every_note(self):
        # all twelve notes: no seven-note scale holds them
        self.assertEqual(identify_key(list(range(60, 72)))["keys"], [])

    def test_empty_input_is_an_error(self):
        with self.assertRaises(TheoryError):
            identify_key([])


class ApiTests(TestCase):
    def test_key_api(self):
        response = self.client.get(reverse("chords:api-key"), {"notes": "60,64,67"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["keys"])

    def test_key_api_rejects_junk(self):
        response = self.client.get(reverse("chords:api-key"), {"notes": "a,b"})
        self.assertEqual(response.status_code, 400)

    def test_studio_page_loads(self):
        self.assertEqual(self.client.get(reverse("chords:studio")).status_code, 200)


class ChordTypesTests(TestCase):
    def test_extended_chords_build_and_identify(self):
        from chords.theory import build_chord, identify_chord
        for key in ("5", "add9", "9", "maj9", "m9", "7b9", "7s9", "69", "mmaj7"):
            chord = build_chord("C", key)
            self.assertEqual(len(chord["midi"]), len(chord["notes"]))
        nine = build_chord("C", "9")
        names = [c["name"] for c in identify_chord(nine["midi"])["chords"]]
        self.assertIn("C9", names)
