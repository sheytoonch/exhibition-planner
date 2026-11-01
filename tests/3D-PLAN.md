# Etap: zoom, ikony i geometryczne granice powierzchni

Zakres zaakceptowany 24 października 2026: punkty 1–3 z `3D-RESEARCH.md`.
Punkt 4, w tym wymiana renderera na WebGL i optymalizacja renderowania, pozostaje
osobnym etapem.

Status: wykonane. Końcowy przebieg `node tests/cad-suite.cjs`:
36/36 zestawów przeszło. Wynik zapisano w `3d-stage-1-results.txt`.
Zoom i przesuwanie kamery są niezależne od 2D, narzędzia mają ikony, a granice
powierzchni zachowują krzywe. Zweryfikowano także wygląd ściany łukowej bez
sztucznych pionowych krawędzi podziału siatki.

Pozostałe prace i kolejność następnego etapu opisuje `3D-NEXT-STEPS.md`.

1. Dodać regresje brakującego zoomu i ikon oraz geometrycznych granic łuków.
2. Wprowadzić osobną skalę i przesunięcie kamery 3D, zoom kółkiem i przyciskami,
   a także jawne dopasowanie całej sceny. Obrót zachowuje ustawioną skalę.
3. Zastąpić napisy narzędzi 3D ikonami SVG z nazwami dostępnymi i podpowiedziami.
4. Rozpoznawać obszary na grafie krawędzi wskazujących krzywe i ich przedziały
   parametrów. Łuki i koła przecinać analitycznie, z obsługą styczności
   i nakładających się fragmentów. Zachować również krzywe Béziera.
5. Przechowywać zewnętrzną pętlę i otwory powierzchni jako krawędzie, liczyć pola
   z krzywych. Siatkę wyświetlania generować oddzielnie. Wyciągnięcie zachowuje
   logiczną powierzchnię walcową wzdłuż łuku.
6. Zachować przypisania wyciągnięć: stabilne identyfikatory nowych powierzchni
   oraz migracja starszych identyfikatorów utworzonych ze współrzędnych.
7. Sprawdzić koła, półkola, przecięcia, styczności, otwory, wspólne krawędzie,
   zmianę geometrii, Ctrl podczas wyciągania, zapis i historię. Uruchomić pełny
   zestaw jednostkowy i przeglądarkowy.
