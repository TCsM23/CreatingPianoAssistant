from pathlib import Path

from django.http import JsonResponse
from django.shortcuts import render
from django.templatetags.static import static
from django.views.decorators.http import require_GET

from .theory import (
    build_chord, build_scale, build_progression, identify_chord, identify_key,
    TheoryError, SHARP_NAMES, CHORD_QUALITIES,
)

from . import lessons, notation

# Fill these in to switch the matching buttons on. Empty = hidden.
ABOUT_LINKS = {
    "email": "yvesjerico@gmail.com",
    "facebook": "facebook.com/yvesjerico.repayo/",
    "youtube": "https://www.youtube.com/@tcsm0023",
    "github": "https://github.com/TCsM23",
    "linkedin": "https://linkedin.com/in/yves-jerico-repayo-72a593444",
    "tip": "",        # your PayPal.me link
    "gcash_qr": True,  # set True after adding static/chords/support-qr.png
}

# From your EmailJS dashboard. Leave empty to hide the message form.
ABOUT_EMAILJS = {
    "service": "service_j9t3wna",
    "template": "template_q4x6tth",
    "key": "aI14LXH9_lJrPbSQ5",
}

# Built-in songs. Each file goes in chords/static/chords/songs/. A song whose file is missing is hidden.
SONGS = [
    {
        "title": "Canon in D (simple arrangement)",
        "composer": "Johann Pachelbel",
        "note": "A simple piano arrangement of Pachelbel's public-domain ground bass and theme.",
        "file": "canon-in-d.mid",
    },
    {
        "title": "Prelude in E minor, Op. 28 No. 4",
        "composer": "Frédéric Chopin",
        "note": "Public domain. MIDI from the Mutopia Project.",
        "file": "chopin-prelude-op28-no4.mid",
    },
]
SONGS_DIR = Path(__file__).resolve().parent / "static" / "chords" / "songs"

# Create your views here.
@require_GET
def api_chord(request):
    root = request.GET.get("root", "C")
    quality = request.GET.get("quality", "maj")
    try:
        chord = build_chord(root, quality)
    except TheoryError as error:
        return JsonResponse({"error": str(error)}, status=400)
    return JsonResponse(chord)

def home(request):
    return render(request, "chords/home.html")

def assistant(request):
    qualities = [(key, label) for key, (symbol, label, formula) in CHORD_QUALITIES.items()]
    chord_types = [
        {"key": key, "symbol": symbol, "label": label, "formula": formula}
        for key, (symbol, label, formula) in CHORD_QUALITIES.items()
    ]
    return render(request, "chords/assistant.html", {
        "note_names": SHARP_NAMES,
        "qualities": qualities,
        "chord_types": chord_types,
    })

def learn(request):
    return render(request, "chords/learn.html", {
        "note_names": SHARP_NAMES,
        "six_words": lessons.SIX_WORDS,
        "sentences": lessons.SENTENCES,
        "three_bs": lessons.THREE_BS,
        "travel_text": lessons.TRAVEL_TEXT,
    })

def practice(request):
    return render(request, "chords/practice.html", {"note_names": SHARP_NAMES})

def notation_page(request):
    return render(request, "chords/notation.html", {
        "note_values": notation.note_value_rows(),
        "dynamics": notation.DYNAMICS,
        "tempos": notation.tempo_rows(),
        "keys": notation.key_signature_rows(),
        "sections": notation.REFERENCE_SECTIONS,
    })

@require_GET
def api_identify(request):
    try:
        midi = [int(n) for n in request.GET.get("notes", "").split(",") if n.strip()]
    except ValueError:
        return JsonResponse({"error": "Notes must be numbers like 60,64,67"}, status=400)
    try:
        return JsonResponse(identify_chord(midi))
    except TheoryError as error:
        return JsonResponse({"error": str(error)}, status=400)

@require_GET
def api_key(request):
    try:
        midi = [int(n) for n in request.GET.get("notes", "").split(",") if n.strip()]
    except ValueError:
        return JsonResponse({"error": "Notes must be numbers like 60,64,67"}, status=400)
    try:
        return JsonResponse(identify_key(midi))
    except TheoryError as error:
        return JsonResponse({"error": str(error)}, status=400)


@require_GET
def api_scale(request):
    root = request.GET.get("root", "C")
    scale = request.GET.get("scale", "major")
    try:
        data = build_scale(root, scale)
    except TheoryError as error:
        return JsonResponse({"error": str(error)}, status=400)
    return JsonResponse(data)


@require_GET
def api_progression(request):
    key = request.GET.get("key", "C")
    numerals = request.GET.get("numerals", "1-5-6m-4")
    try:
        data = build_progression(key, numerals)
    except TheoryError as error:
        return JsonResponse({"error": str(error)}, status=400)
    return JsonResponse(data)

def about(request):
    chord_rows = []
    for key, (symbol, label, formula) in CHORD_QUALITIES.items():
        chord_rows.append({
            "label": label,
            "symbol": "C" + symbol,
            "steps": " · ".join(str(n) for n in formula),
            "notes": " ".join(SHARP_NAMES[n % 12] for n in formula),
        })
    return render(request, "chords/about.html", {
        "links": ABOUT_LINKS,
        "emailjs": ABOUT_EMAILJS,
        "chord_rows": chord_rows,
    })


STUDIO_TRACKS = [
    {"id": "kick", "name": "Kick"},
    {"id": "snare", "name": "Snare"},
    {"id": "clap", "name": "Clap"},
    {"id": "hat", "name": "Hi-hat"},
    {"id": "open", "name": "Open hat"},
    {"id": "tom", "name": "Tom"},
    {"id": "rim", "name": "Rim"},
    {"id": "cow", "name": "Cowbell"},
]


def studio(request):
    return render(request, "chords/studio.html", {
        "tracks": STUDIO_TRACKS,
        "steps": range(16),
    })


def songs(request):
    library = []
    for song in SONGS:
        if (SONGS_DIR / song["file"]).exists():
            library.append({**song, "url": static("chords/songs/" + song["file"])})
    return render(request, "chords/songs.html", {"library": library})
