"""Notation reference data. Plain Python, no Django."""

from .theory import SHARP_NAMES

# ---- I. note values: (US name, UK name, beats; a quarter note = 1) ----
NOTE_VALUES = [
    ("Whole note", "Semibreve", 4),
    ("Half note", "Minim", 2),
    ("Quarter note", "Crotchet", 1),
    ("Eighth note", "Quaver", 0.5),
    ("16th note", "Semiquaver", 0.25),
]

# ---- II. dynamics: (sign, term, meaning, playback volume) ----
DYNAMICS = [
    ("ppp", "Pianississimo", "Very, very quiet.", 0.012),
    ("pp", "Pianissimo", "Very quiet.", 0.025),
    ("p", "Piano", "Quiet.", 0.045),
    ("mp", "Mezzo piano", "Moderately quiet.", 0.07),
    ("mf", "Mezzo forte", "Moderately loud.", 0.10),
    ("f", "Forte", "Loud.", 0.13),
    ("ff", "Fortissimo", "Very loud.", 0.16),
    ("fff", "Fortississimo", "Very, very loud.", 0.20),
]

# ---- III. tempo: (term, low BPM, high BPM, meaning). Common ranges; sources differ. ----
TEMPO_BPM = [
    ("Largo", 40, 60, "Broad, slow."),
    ("Adagio", 66, 76, "At ease, slow."),
    ("Andante", 76, 108, "Moving along, gently flowing."),
    ("Moderato", 108, 120, "Moderate, restrained."),
    ("Allegro", 120, 156, "Merry, quick, lively."),
    ("Vivace", 156, 176, "Vivacious, fast and lively."),
    ("Presto", 168, 200, "Fast."),
]

# ---- IV. key signatures ----
FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
SHARP_ORDER = ["F#", "C#", "G#", "D#", "A#", "E#", "B#"]
FLAT_ORDER = ["Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Fb"]

# ---- V. everything else: a list of sections, each a list of (term, meaning) ----
REFERENCE_SECTIONS = [
    {"id": "articulations", "title": "Articulations", "rows": [
        ("Accent", "Accented, emphasised."),
        ("Tenuto", "Hold for full length, often implies a slight stress."),
        ("Staccato", "Short and detached."),
        ("Legato", "Notes joined smoothly together."),
        ("Marcato", "Marked, emphasised. Stronger than an accent."),
    ]},
    {"id": "dynamic-changes", "title": "Changes in dynamics", "rows": [
        ("cresc.", "Crescendo. Gradually getting louder."),
        ("dim.", "Diminuendo. Gradually getting quieter."),
        ("sfz", "Sforzando. Reinforced, strongly accented."),
        ("fp", "Forte-piano. Loud, then immediately quiet."),
    ]},
    {"id": "expressive", "title": "Expressive marks", "rows": [
        ("cantabile", "Singing, lyrical."),
        ("dolce", "Sweet, gently."),
        ("espressivo", "Expressively."),
        ("leggiero", "Lightly."),
        ("pesante", "Heavily."),
        ("rubato", "Robbed time, not in strict time."),
        ("scherzando", "Playful, joking."),
        ("tranquillo", "Tranquil."),
    ]},
    {"id": "repeats", "title": "Repeats", "rows": [
        ("D.C.", "Da capo. Back to the beginning."),
        ("Fine", "End of the music."),
        ("D.C. al Fine", "Back to the beginning, then play to the end."),
        ("D.S.", "Dal segno. Back to the segno (the sign)."),
        ("Coda", "The ending section of a piece of music."),
    ]},
    {"id": "ornaments", "title": "Ornaments and other signs", "rows": [
        ("Trill", "Rapid alternation between a note and the one above it."),
        ("Mordent", "A single quick alternation: the note, the one above (or below), then the note again."),
        ("Turn", "The note above, the main note, the note below, then the main note."),
        ("Arpeggio", "The notes of a chord played one after another, usually low to high."),
        ("Glissando", "A slide across the keys from one note to another."),
        ("Fermata", "Hold the note longer than its written value."),
    ]},
    {"id": "pedals", "title": "Pedals", "rows": [
        ("Sustain pedal", "Right pedal. Lifts the dampers so sound continues without holding the key."),
        ("Sostenuto pedal", "Middle pedal (on some pianos). Sustains only specific notes."),
        ("Una corda", "The left pedal. Softens the tone."),
    ]},
    {"id": "time", "title": "Time signatures", "rows": [
        ("4/4", "Four beats per bar, each beat splitting into two. Also called common time."),
        ("3/4", "Three beats per bar, each beat splitting into two."),
        ("6/8", "Two beats per bar, each beat splitting into three."),
    ]},
]


def note_value_rows():
    """Dicts for the template: names, beats, dotted beats, and a bar width in percent."""
    rows = []
    for us, uk, beats in NOTE_VALUES:
        rows.append({
            "us": us,
            "uk": uk,
            "beats": f"{beats:g}",
            "dotted": f"{beats * 1.5:g}",
            "width": f"{beats / 4 * 100:g}",
        })
    return rows


def tempo_rows():
    return [
        {"term": term, "lo": lo, "hi": hi, "mid": (lo + hi) // 2, "meaning": meaning}
        for term, lo, hi, meaning in TEMPO_BPM
    ]


def _key_row(names, pitch_class, count, kind, accidentals):
    plural = "" if count == 1 else "s"
    return {
        "major": names[pitch_class],
        "minor": names[(pitch_class - 3) % 12] + "m",
        "label": "no sharps or flats" if count == 0 else f"{count} {kind}{plural}",
        "accidentals": " ".join(accidentals) or "none",
    }


def key_signature_rows():
    """Computed with the circle of fifths: each sharp key is 7 semitones above the last."""
    rows = []
    for count in range(0, 7):
        rows.append(_key_row(SHARP_NAMES, (7 * count) % 12, count, "sharp", SHARP_ORDER[:count]))
    for count in range(1, 7):
        rows.append(_key_row(FLAT_NAMES, (5 * count) % 12, count, "flat", FLAT_ORDER[:count]))
    return rows