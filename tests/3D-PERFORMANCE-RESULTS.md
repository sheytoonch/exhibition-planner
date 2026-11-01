# Wyniki optymalizacji 3D

24 października 2026. Wyniki dotyczą lokalnego środowiska testowego;
nie stanowią gwarancji jednakowego czasu na każdym urządzeniu.

## Zmiana

Usunięto programowy rasteryzator i pełnoekranowe bufory pikseli/głębokości CPU.
WebGL 2 rysuje indeksowaną siatkę ze sprzętowym testem głębokości. Bufory
pozostają na GPU podczas ruchu kamery. Żądania odświeżenia łączy rAF;
nieruchomy widok nie renderuje się w ciągłej pętli.

Granice i pola powierzchni nadal wynikają z analitycznych krzywych. Siatka
służy do wyświetlania i wybierania promieniem, a jej dokładność zależy od zoomu
z histerezą. Cache obejmuje najwyżej trzy poziomy. Fragmenty poza kadrem są
odrzucane, odcinki rysowane instancjami, wybieranie korzysta z drzewa przestrzennego.

## Metoda

`3d-benchmark.cjs` tworzy szkice i wyciągnięcia przez rzeczywisty interfejs,
następnie obraca je przez widoki XY/XZ/YZ w obu kierunkach. Pięć przypadków
(prostokąt, koło, półkole, otwór, pięć obszarów), DPR 1 i 2, okno 1500×1200.
Punkt odniesienia zapisano przed zmianą renderera w `3d-benchmark-baseline.json`.
Wynik końcowy i SHA-256 kodu zapisuje `3d-benchmark-gpu.json`.

CPU oznacza czas pracy renderera na głównym wątku, a timer GPU mierzy
asynchronicznie pracę GPU. Odstępy rAF opisują harmonogram przeglądarki;
nie należy przedstawiać ich jako pomiaru liczby faktycznie wyświetlonych klatek.
Benchmark końcowy wymaga CPU p95 poniżej 10 ms, braku długich zadań podczas
obrotu, braku ponownego wykrywania powierzchni i niezmienionego modelu.

## Większe sceny i zasoby

`3d-scale-benchmark.cjs` mierzy osobno komponent renderujący dla 1/10/100/1000
wygenerowanych powierzchni. To nie jest pomiar tysiąca operacji edycji CAD.
Wyniki: `3d-scale-results.json`. Dla 1000 powierzchni: 2000 trójkątów,
8 wywołań rysowania, 44,4 ms rozpoznania obrysów, 11,2 ms budowy siatki,
około 0,1 ms CPU p95 na klatkę. Te dwie przebudowy nie występują przy obrocie.
Promień rozpatrywał 7 kandydatów. Nie wystąpiły błędy WebGL.

Test 30 wymian siatki i podkładów potwierdza ponowne użycie buforów oraz
usuwanie zbędnych tekstur: pozostają 4 bufory, 3 VAO, 3 programy i jedna
tekstura zaznaczenia. Nie jest to pomiar całej sterty ani długoterminowego
zużycia pamięci przez historię edycji CAD. Cache scen i próbek pomiarowych
ma jawne limity. Worker nie jest potrzebny do zmierzonego obrotu. Przebudowa
1000 obrysów przekracza budżet pojedynczej klatki 60 Hz; przeniesienie jej do
Workera pozostaje rozszerzeniem dla edycji dużych scen, nie wykonaną optymalizacją.

## Poprawność i ograniczenia

Testy obejmują otwory, wklęsłości, styczne obrysy, zasłanianie w obu
kolejnościach rysowania, powierzchnie grubości zero z obu stron, wybór przez
otwory, Ctrl, wyciąganie, cofanie i zapis. Brak WebGL pozostawia projekt
w edytowalnym widoku 2D; utrata i odtworzenie kontekstu nie usuwa danych.

Pełny przebieg `node tests/cad-suite.cjs`: **39/39** zestawów.
Log: `3d-final-suite.log`. Starsze testy manipulatora czekają teraz na klatkę
po zmianie kamery; zachowano sprawdzanie kierunków, gestów i stanu przycisków.

Nowe płaszczyzny w przestrzeni i kolejne szkice pozostają osobnym zakresem
funkcjonalnym. Wyniki dla prostych powierzchni nie opisują dowolnej liczby
skomplikowanych modeli lub dużych tekstur.


## Porównanie przed / po

CPU renderowania p95 w milisekundach; długie zadania dotyczą całego gestu.

| Scena | DPR | CPU przed | CPU po | Długie zadania przed / po | GPU p95 po |
| --- | --- | --- | --- | --- | --- |
| rectangle | 1 | 27.1 | 1.1 | 0 / 0 | 0.045 |
| circle | 1 | 22.2 | 1.0 | 1 / 0 | 0.081 |
| arc | 1 | 22.4 | 1.1 | 1 / 0 | 0.387 |
| hole | 1 | 23.7 | 0.9 | 0 / 0 | 0.388 |
| five | 1 | 18.1 | 0.9 | 0 / 0 | 2.209 |
| rectangle | 2 | 130.3 | 1.1 | 149 / 0 | 1.930 |
| circle | 2 | 127.7 | 0.9 | 150 / 0 | 1.945 |
| arc | 2 | 115.6 | 0.9 | 150 / 0 | 1.509 |
| hole | 2 | 122.3 | 1.0 | 149 / 0 | 0.200 |
| five | 2 | 118.9 | 0.9 | 148 / 0 | 0.249 |

Środowisko: win32, 12th Gen Intel(R) Core(TM) i7-12700KF, Edge 156.0.4314.42.
GPU: ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11).
SHA-256 app.js: `72c206eb66e6613cd7af33091a4b5696a3803db3a759c32c68da1a58a7cc1602`.

Wszystkie 10 scenariuszy spełniło asercje benchmarku.
