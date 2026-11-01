# Checkpoint prac nad wydajnością 3D

Cel: wykonać po kolei etapy 1–6 z `3D-NEXT-STEPS.md`.
Po każdym etapie zapisać wynik, sprawdzenia i następny krok. Kontynuacja nie
wymaga ponownego zatwierdzania zakończonych etapów.

Stan początkowy: punkty zoom/ikony/granice krzywoliniowe wykonane; ostatni pełny
zestaw 36/36. Renderer nadal programowy, Canvas 2D.

| Etap | Stan |
| --- | --- |
| 1. Aktualne pomiary i odtworzenie przycinania | zakończone |
| 2. Oddzielenie sceny od kamery | zakończone; testy ukierunkowane |
| 3. Renderer WebGL 2 i siatka | zakończone; testy GPU przechodzą |
| 4. Wybieranie i manipulacja | zakończone; testy interakcji przechodzą |
| 5. Szczegółowość i większe sceny | zakończone; testy LOD i zasobów przechodzą |
| 6. Odbiór i pełne regresje | zakończone; 39/39, benchmark 10/10 |

Etap 1: `3d-benchmark-baseline.json` zawiera 10 scenariuszy, długie obroty
przez XY/XZ/YZ, DPR 1/2, czasy CPU/zdarzeń, odstępy rAF i długie zadania.
Przykład: jedno koło przy DPR 2 — p95 CPU renderowania około 128 ms.
Test `3d-cache.test.cjs` odtworzył 12 przebudów granic i 24 zmiany rozmiaru canvasu
dla 12 kroków obrotu.

Etap 2: dodano rewizje modelu i sceny, cache lokalnych ścian, odświeżanie przez
requestAnimationFrame oraz zmianę rozmiaru canvasu wyłącznie po zmianie wymiarów.
Test cache teraz przechodzi; wyciąganie i zmiana zestawu przez Ctrl przechodzą.
Testowy helper wyboru czeka na prezentację nowego ustawienia kamery.

Etapy 3–4: dodano PlanMesh (triangulacja obrysów i otworów, bufor indeksów,
drzewo przestrzenne do promieni), PlanGpu (WebGL 2, bufory GPU, test głębokości,
tekstury podkładów). Stary PlanRaster usunięto; jego test zasłaniania zastąpiono
sprawdzeniem rzeczywistych pikseli GPU. Uchwyt korzysta z osobnej nakładki SVG.
Testy: gpu-mesh, gpu-browser, extrude, sketch-faces, 3d-cache, 3d-controls — przechodzą.
Sprawdzono także brak WebGL i utratę/odtworzenie kontekstu bez utraty projektu.

Etap 5: dodano poziomy szczegółowości z histerezą i ograniczonym cache, odrzucanie
fragmentów sceny poza kadrem oraz instancjonowanie odcinków. Timer GPU jest
włączany tylko na potrzeby pomiarów i odczytywany asynchronicznie.

Etap 5: `3d-scale-results.json` zawiera pomiar komponentu dla 1/10/100/1000
niezależnych powierzchni. Przy 1000: topologia 44,4 ms, budowa siatki 11,2 ms,
obrót CPU p95 0,1 ms,
2000 trójkątów, 8 wywołań rysowania, 7 kandydatów wybierania, brak błędów GL.
To test renderera, nie projektu utworzonego tysiącem operacji w interfejsie.
Test 30 wymian podkładów i siatek potwierdza stałą liczbę buforów/tekstur;
nie jest pomiarem całej sterty aplikacji. Worker nie jest potrzebny do obrotu;
przebudowa tysięcy obrysów po edycji przekracza budżet jednej klatki 60 Hz
i pozostaje kandydatem do osobnego rozszerzenia.

Pierwszy pełny przebieg: 37/39. Dwa testy manipulatora wymagały oczekiwania na
klatkę po przejściu renderowania na rAF; po dodaniu oczekiwania przechodzą
z zachowanymi asercjami. Dodatkowe testy LOD i zasobów GPU również przechodzą.
Drugi pełny przebieg: **39/39**, `3d-final-suite.log`.

Końcowy benchmark wykonano bez równoległych testów: **10/10** scenariuszy
spełnia CPU p95 <10 ms, zero długich zadań przy obrocie, zero przebudów
topologii i niezmieniony model. Pięć obszarów przy DPR 2: CPU p95 118,9 → 0,9 ms.
Raport, środowisko, SHA-256 i ograniczenia: `3D-PERFORMANCE-RESULTS.md`.

Naprawa zgłoszonego przycinania obrotu jest zakończona. Pozostałe rozszerzenia:
Worker dla przebudowy dużych szkiców, profil całej sterty/historii podczas
długich sesji oraz funkcje nowych płaszczyzn i kolejnych szkiców.
Nie przedstawiać ich jako już wykonanych ani tysiąca prostych powierzchni
jako pomiaru dowolnej sceny CAD.

## Wyciąganie bez zatwierdzania

Usunięto przyciski zatwierdzania i anulowania. Wpisana wysokość zapisuje się
od razu, przeciągnięcie po puszczeniu uchwytu; Ctrl zmienia zapisany zestaw.
Escape i przejście do 2D kończą narzędzie, zachowując wynik. Zmiany w jednej
sesji narzędzia stanowią jedną operację cofania. Samo otwarcie i zamknięcie
narzędzia nie tworzy wyciągnięcia. Ukierunkowany test `extrude.test.cjs`: 4/4.
Pełny przebieg: **39/39**, `extrude-direct-suite.log`.
