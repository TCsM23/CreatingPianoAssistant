from django.urls import path

from . import views

app_name = "chords"

urlpatterns = [ 
    path("", views.home, name="home"),
    path("assistant/", views.assistant, name="assistant"),   
    path("learn/", views.learn, name="learn"),          
    path("practice/", views.practice, name="practice"),   
    path("notation/", views.notation_page, name="notation"),               
    path("api/chord/", views.api_chord, name="api-chord"),
    path("api/scale/", views.api_scale, name="api-scale"),
    path("api/progression/", views.api_progression, name="api-progression"),
]                                                  