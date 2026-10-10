"""Music Theory Engine. Plain Python, No Django here."""

SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

FLAT_TO_SHARP = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}

# key: (symbol, label, formula in semitones)

CHORD_QUALITIES = {
    "maj": ("", "Major", [0, 4, 7]),
    "min": ("m", "Minor", [0, 3, 7]),
    "dim": ("dim", "Diminished", [0, 3, 6]),
    "aug": ("aug", "Augmented", [0, 4, 8]),
    "7": ("7", "Dominant 7th", [0, 4, 7, 10]),
    "maj7": ("maj7", "Major 7th", [0, 4, 7, 11]),
    "m7": ("m7", "Minor 7th", [0, 3, 7, 10]),
    "sus2": ("sus2", "Suspended 2nd", [0, 2, 7]),
    "sus4": ("sus4", "Suspended 4th", [0, 5, 7]),
    "6":    ("6",    "Major 6th",     [0, 4, 7, 9]),
    "m6":   ("m6",   "Minor 6th",     [0, 3, 7, 9]),
    "dim7": ("dim7", "Diminished 7th", [0, 3, 6, 9]),
    "m7b5": ("m7b5", "Half-diminished 7th", [0, 3, 6, 10]),
}

SCALES = {
    "major": ("Major", [0, 2, 4, 5, 7, 9, 11]),
    "minor": ("Natural minor", [0, 2, 3, 5, 7, 8, 10]),
}

# the six "words": scale degree -> semitones above the key note
DEGREE_OFFSETS = {1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9}


class TheoryError(ValueError):
    """Raise when someone asks for a note or chord that doesn't exist."""


def note_to_pc(name):
    """'C' -> 0, 'Bb' -> 10, 'f#' -> 6."""
    name = name.strip().capitalize()
    name = FLAT_TO_SHARP.get(name, name)
    if name not in SHARP_NAMES:
        raise TheoryError(f"Unknown note: {name!r}")
    return SHARP_NAMES.index(name)

def build_chord(root, quality="maj", octave=4):
    """Return the notes of a chord, plus MIDI numbers for the keyboard."""
    if quality not in CHORD_QUALITIES:
        raise TheoryError(f"Unknown chord type: {quality!r}")

    symbol, label, formula = CHORD_QUALITIES[quality]
    root_pc = note_to_pc(root)

    notes = [SHARP_NAMES[(root_pc + step) % 12] for step in formula]
    base = 12 * (octave + 1) + root_pc          # C4 = 60
    midi = [base + step for step in formula]

    return {
        "name": SHARP_NAMES[root_pc] + symbol,
        "label": f"{SHARP_NAMES[root_pc]} {label}",
        "notes": notes,
        "midi": midi
    }

def build_scale(root, scale="major", octave=4):
    if scale not in SCALES:
        raise TheoryError(f"Unknown scale: {scale!r}")
    label, steps = SCALES[scale]
    root_pc = note_to_pc(root)
    base = 12 * (octave + 1) + root_pc
    return {
        "name": f"{SHARP_NAMES[root_pc]} {label}",
        "notes": [SHARP_NAMES[(root_pc + s) % 12] for s in steps],
        "midi": [base + s for s in steps] + [base + 12],
    }

def parse_numeral(token):
    """'5' -> (5, 'maj'), '6m' -> (6, 'min')."""
    token = token.strip().lower()
    is_minor = token.endswith("m")
    digits = token[:-1] if is_minor else token
    if not digits.isdigit() or int(digits) not in DEGREE_OFFSETS:
        raise TheoryError(f"Unknown number: {token!r}. Use 1 to 6, like 1, 2m, 5.")
    return int(digits), ("min" if is_minor else "maj")

def build_progression(key, numerals, octave=4):
    key_pc = note_to_pc(key)
    tokens = [t for t in numerals.replace(",", "-").replace(" ", "-").split("-") if t]
    if not tokens:
        raise TheoryError("Give at least one number, like 1-5-6m-4")

    chords = []
    for token in tokens:
        degree, quality = parse_numeral(token)
        root_name = SHARP_NAMES[(key_pc + DEGREE_OFFSETS[degree]) % 12]
        chord = build_chord(root_name, quality, octave)
        chord["numeral"] = token
        chords.append(chord)
    return {"key": SHARP_NAMES[key_pc], "chords": chords}


INTERVAL_NAMES = {
    0: "Octave", 1: "Minor 2nd", 2: "Major 2nd", 3: "Minor 3rd", 4: "Major 3rd", 5: "Perfect 4th",
    6: "Tritone", 7: "Perfect 5th", 8: "Minor 6th", 9: "Major 6th", 10: "Minor 7th", 11: "Major 7th",
}

def identify_chord(midi_list):
    """Which chords contain exactly these notes? Root position is ranked first."""
    midi = sorted({int(m) for m in midi_list})
    if not midi:
        raise TheoryError("Pick at least one note.")
    bass = midi[0] % 12
    pcs = {m % 12 for m in midi}

    names = []
    for m in midi:
        name = SHARP_NAMES[m % 12]
        if name not in names:
            names.append(name)

    interval = None
    if len(midi) == 2:
        interval = INTERVAL_NAMES[(midi[1] - midi[0]) % 12]

    chords = []
    if len(pcs) >= 3:
        for root in range(12):
            if root not in pcs:
                continue
            shape = {(p - root) % 12 for p in pcs}
            for symbol, label, formula in CHORD_QUALITIES.values():
                if shape == set(formula):
                    name = SHARP_NAMES[root] + symbol
                    inverted = root != bass
                    if inverted:
                        name += "/" + SHARP_NAMES[bass]
                    chords.append({
                        "name": name,
                        "label": f"{SHARP_NAMES[root]} {label}",
                        "inversion": inverted,
                    })
    chords.sort(key=lambda c: c["inversion"])
    return {"notes": names, "midi": midi, "interval": interval, "chords": chords}