from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET

from .theory import (
    build_chord, build_scale, build_progression,
    TheoryError, SHARP_NAMES, CHORD_QUALITIES,
)

from . import lessons, notation

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
    return render(request, "chords/assistant.html", {
        "note_names": SHARP_NAMES,
        "qualities": qualities,
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