# Diagnoza widoku 3D i kierunek przebudowy

Data: 24 października 2026. Zakres: analiza kodu, pomiary w przeglądarce i research
dokumentacji źródłowej. W tym etapie nie zmieniano plików aplikacji.

To raport stanu przed poprawkami. Późniejszy etap wdrożenia zoomu, ikon i granic
krzywoliniowych opisują `3D-PLAN.md` i `CAD-BASELINE.md`. Renderer i optymalizacja
wydajności pozostają osobnym etapem; pomiary w tym pliku dotyczą starego stanu.

## Wynik analizy

Najważniejszy problem to programowe renderowanie 3D na głównym wątku JavaScript.
Obecna implementacja nie wykorzystuje GPU do rysowania brył i testowania ich
głębokości. Dodatkowo utożsamia część operacji geometrycznych z próbkowaną
reprezentacją łuków. Oba zagadnienia trzeba rozdzielić: geometria modelu powinna
zachować krzywe, a renderer powinien korzystać z zapamiętanej siatki na GPU.

Dotychczasowe testy funkcjonalne potwierdzały poprawność wyboru, zapisu i historii,
lecz nie zawierały budżetu czasu klatki. Ich przejście nie było dowodem płynności.

## 1. Zoom i narzędzia

Fakty z kodu:

- `style.css`, reguła `.orbit-mode`, ukrywa `.plan-zoom-controls`.
- Obsługa `wheel` w `app.js` zawsze wywołuje `setZoom` kamery 2D.
- `renderOrbit` wylicza skalę samodzielnie, ignorując zoom 2D.
- Każdy obrót ponownie dopasowuje bryłę do kadru. Takie dopasowywanie miesza
  transformację kamery z automatycznym kadrowaniem i utrudnia stabilny zoom.
- Przyciski `plan-faces`, `plan-extrude`, zatwierdzenie i anulowanie zawierają tekst.

W pomiarach kółko myszy nie zmieniło obrazu 3D w żadnym z sześciu scenariuszy.
Obecne zachowanie jest brakiem implementacji, nie ograniczeniem geometrii.

Proponowane zachowanie:

- Osobna kamera 3D: orientacja, punkt obrotu, przesunięcie i skala ortograficzna.
- Kółko oraz przyciski +/− sterują wyłącznie aktywnym widokiem.
- Dopasowanie całej sceny jest osobną akcją; nie działa przy każdym obrocie.
- Zoom może utrzymywać punkt pod kursorem; stan kamery 2D pozostaje niezależny.
- Narzędzia 3D otrzymują SVG w istniejącym stylu, `aria-label`, podpowiedzi
  i stan aktywny. Wysokość pozostaje czytelnym polem liczbowym.
- Prawy przycisk pozostaje wyłączony zgodnie z wcześniejszym wymaganiem.

## 2. Jak obecnie działają łuki i powierzchnie

Szkic już przechowuje łuk przez trzy punkty, koło przez środek i promień,
a Béziera przez punkty i uchwyt. Nie trzeba zmieniać wygodnego sposobu ich rysowania.
Utrata informacji o rodzaju granicy następuje później, w `PlanFaces.paths`:

- Łuk i koło są zamieniane na wiele odcinków.
- Bézier jest próbkowany na 256 odcinków.
- `PlanFaces.detect` szuka przecięć wszystkich par tych odcinków. Ma zatem
  kwadratowy koszt względem liczby odcinków, z odrzucaniem nieprzecinających
  się prostokątów ograniczających wewnątrz pętli.
- Wykryta powierzchnia przechowuje wielokąt i otwory, bez odwołań do źródłowych
  krzywych. Jej identyfikator jest długim napisem utworzonym ze współrzędnych.
- Wyciąganie tworzy oddzielny czworokąt renderera dla każdego odcinka granicy.

To nie oznacza, że jedno koło tworzy setki niezależnych powierzchni szkicu.
Jedna powierzchnia kołowa jest jednak obsługiwana przy wyświetlaniu jak wiele
wielokątów. W badanym przykładzie jedno wyciągnięte koło dawało 275 wielokątów:
273 boczne i dwie podstawy. Półkole z cięciwą dawało 140 wielokątów.

Docelowy model powinien rozróżniać:

1. Płaszczyznę podparcia szkicu: początek, osie, normalną.
2. Krzywe i ograniczone nimi krawędzie: odcinek, łuk kołowy, Bézier oraz zakres
   parametru krzywej.
3. Powierzchnię: odniesienie do płaszczyzny, zewnętrzną pętlę krawędzi i pętle otworów.
4. Wyciągnięcie: odniesienia do powierzchni, kierunek i wysokość.
5. Siatkę wyświetlania: przybliżenie przechowywane niezależnie od geometrii modelu.

Okrągła podstawa nadal jest jedną płaską powierzchnią. Jej boczna powierzchnia
po wyciągnięciu jest walcowa; nie musi być zbiorem płaskich ścian w modelu.
Na ekranie może być przedstawiona przez trójkąty, które nie stają się osobnymi
obiektami użytkownika. To zgodne z rozróżnieniem geometrii, topologii i triangulacji
w [Open CASCADE Modeling Data](https://occt3d.com/dev/doc/overview/html/occt_user_guides__modeling_data.html).

Do rozpoznawania obszarów należy zachować graf półkrawędzi, ale jego krawędzie
powinny wskazywać krzywe i przedziały parametrów. Podział jest potrzebny w miejscach
rzeczywistych przecięć i połączeń, nie w każdym punkcie próbkowania. CGAL pokazuje
takie podziały płaszczyzny z odcinkami i łukami w
[2D Arrangements](https://doc.cgal.org/latest/Arrangement_on_surface_2/index.html)
oraz [Arr_circle_segment_traits_2](https://doc.cgal.org/latest/Arrangement_on_surface_2/classCGAL_1_1Arr__circle__segment__traits__2.html).

Przecięcia linia–okrąg i okrąg–okrąg można obliczać analitycznie, następnie
ograniczać do zakresów łuków. Potrzebna jest obsługa styczności, nakładania,
pełnego okręgu, bardzo krótkich fragmentów i tolerancji zależnej od skali.
Obliczenia na zwykłych liczbach JS nadal podlegają błędom numerycznym; analityczny
wzór nie jest gwarancją dokładnej arytmetyki. Przykład rzeczywiście dokładnych
predykatów i konstrukcji opisuje
[CGAL Circular Geometry Kernel](https://doc.cgal.org/latest/Circular_kernel_2/index.html).

Pola powierzchni ograniczonych odcinkami i łukami można obliczać z całki po
brzegu, zamiast z gęstego wielokąta. To samo dotyczy objętości prostego wyciągnięcia:
pole podstawy razy podpisana wysokość. Nie wymaga to przeliczania siatki ekranu.

## 3. Pomiary obrotu jednej bryły

Uruchomienie: `node tests/3d-performance-research.cjs`.

Środowisko pomiarowe: Edge 156.0.4314.42 w trybie headless, okno 1500×1200,
DPR 1 i 2, bez emulowanego spowolnienia CPU. Osobny kontekst WebGL 2 był dostępny
przez ANGLE / NVIDIA GeForce RTX 4070 / Direct3D11. Obecny renderer aplikacji
nie korzysta z tego kontekstu do wyświetlania brył.

Każdy przypadek powstawał przez rysowanie, wybór powierzchni i wyciągnięcie
w interfejsie. Instrumentacja dodawała wyłącznie pomiar czasu funkcji i zdarzeń
w pamięci strony. Nie wstawiała geometrii do modelu ani nie zmieniała kodu aplikacji.

Badano po siedem obrotów wokół ustawienia XY i pięć wokół XZ, po cztery kroki myszy
w każdej próbie: łącznie 288 kroków w sześciu scenariuszach. Rejestrowano czas
synchronicznej obsługi kroku oraz samego `PlanRaster.paint`.

| Bryła | DPR | Wielokąty renderera | Zakres median czasu kroku dla badanych ustawień | Najdłuższy krok |
| --- | --- | --- | --- | --- |
| Prostokąt wyciągnięty | 1 | 6 | 14,8–29,0 ms | 41,8 ms |
| Koło wyciągnięte | 1 | 275 | 16,8–30,3 ms | 50,1 ms |
| Półkole z cięciwą wyciągnięte | 1 | 140 | 15,8–27,3 ms | 40,1 ms |
| Prostokąt wyciągnięty | 2 | 6 | 55,3–87,6 ms | 93,6 ms |
| Koło wyciągnięte | 2 | 275 | 62,9–85,7 ms | 98,0 ms |
| Półkole z cięciwą wyciągnięte | 2 | 140 | 59,1–80,9 ms | 84,9 ms |

Pełne dane: [3d-performance-research.json](3d-performance-research.json).
To czas obsługi zdarzenia, nie pomiar FPS ani końcowego czasu prezentacji klatki.
Wyniki dotyczą tych scenariuszy i tego środowiska, nie dokładnie projektu użytkownika.

W tych próbach nie wystąpiło trwałe zawieszenie ani nieskończona pętla.
Wystąpiło natomiast blokowanie głównego wątku na dziesiątki milisekund.
Nie potwierdzono jednego wyjątkowego błędu dokładnie przy przejściu przez XY:
koszt jest wysoki także w sąsiednich ustawieniach i przy XZ. Projekcje ścian
stają się wtedy zdegenerowane; taki przypadek trzeba nadal objąć testem stabilności.

Podczas badanych obrotów liczba wywołań `PlanFaces.detect` wynosiła zero.
Cache rozpoznanych obszarów działa. Nie ma podstaw do twierdzenia, że każdy
ruch kamery ponownie wyszukuje przecięcia całego szkicu.

Istotne jest podobieństwo czasów prostokąta i koła mimo bardzo różnej liczby
wielokątów. W obecnym rozwiązaniu dominuje koszt pracy na pikselach całego obrazu,
a nie wyłącznie liczba boków łuku.

## 4. Przyczyny kosztu renderowania

`PlanRaster.paint` dla każdej klatki:

- Odczytuje pełny obraz przez `getImageData`.
- Tworzy nowy `Float32Array` na bufor głębokości i wypełnia go.
- Przegląda wiersze wielokątów, sortuje przecięcia, oblicza głębokość i miesza
  składowe koloru każdego pokrytego piksela w pętlach JS.
- Ponownie przechodzi przez krawędzie, aby testować widoczność obrysu.
- Przekazuje pełny obraz z powrotem przez `putImageData`.

Przy DPR 2 bufor ma 7,2 miliona pikseli. Sam nowy obraz RGBA i tablica głębokości
to około 57,6 MB danych na wywołanie, bez pozostałych tablic i pracy przeglądarki.
Przy docelowych 60 klatkach/s oznaczałoby to około 3,46 GB/s nowo tworzonych
buforów. Jest to wyliczenie objętości alokacji, nie pomiar rzeczywistej przepustowości.

Specyfikacja HTML wskazuje, że odczyty danych z przyspieszonych canvasów stanowią
kosztowny przypadek; `willReadFrequently` może skłonić przeglądarkę do użycia
oprogramowania. Taka opcja nie zamienia naszego renderera w wydajny silnik 3D.
Źródła: [HTML canvas](https://html.spec.whatwg.org/multipage/canvas.html),
[Chrome Canvas2D](https://developer.chrome.com/blog/canvas2d).

Pozostałe koszty z kodu:

- Każde renderowanie przypisuje `canvas.width` i `canvas.height`, nawet jeśli
  rozmiar nie uległ zmianie. Takie przypisanie resetuje kontekst również dla
  tej samej wartości: [MDN canvas width](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/width).
- Rysowanie jest wykonywane bezpośrednio z `pointermove`, bez łączenia żądań
  przez `requestAnimationFrame`.
- Granice grup, ściany, projekcje do wybierania i wiele tablic są budowane na nowo.
- Klucz cache jest sprawdzany przez serializację geometrii do JSON.
- Gizmo i pasek narzędzi wykonują zmiany DOM oraz odczyty układu w trakcie obrotu.
- Automatyczne dopasowanie kadru jest wykonywane przy każdym ruchu kamery.

## 5. Rekomendowane rozwiązanie

### Renderer GPU jako pierwszy istotny etap

Zastąpić programowy renderer przez WebGL 2 z buforem głębokości. Siatki i indeksy
utrzymywać w buforach GPU. Obrót ma aktualizować kamerę, a nie budować geometrię
lub kopiować obraz do JS. Zgrupować rysowanie według materiałów, nie tworzyć
osobnego wywołania GPU dla każdego drobnego odcinka łuku.

Test głębokości jest częścią potoku graficznego:
[Khronos Depth Test](https://wikis.khronos.org/opengl/Depth_Test).
Zalecenia dotyczące buforów, ograniczania blokujących operacji i grupowania
rysowania: [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
oraz [bufferData](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/bufferData).

To jest rekomendacja architektoniczna, nie zmierzony już wynik nowego renderera.
Nowy renderer nie został w tym etapie wdrożony ani porównany wydajnościowo.

### Geometria i siatka aktualizowane tylko po zmianie danych

Wprowadzić oddzielne wersje szkicu, topologii, siatki, zaznaczenia i kamery.
Sam obrót lub zoom nie unieważnia geometrii. Zmiana zaznaczenia aktualizuje kolory
i aktywną operację; zmiana wysokości aktualizuje tylko odpowiednią geometrię
lub parametr wyciągnięcia. Samo stanie w miejscu nie uruchamia ciągłej pętli renderowania.

Żądania odświeżenia powinny być łączone do jednego na klatkę przez
[requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame).
Współczynniki obrotu należy obliczać raz dla klatki, zamiast wielokrotnie wywoływać
funkcje trygonometryczne dla każdego wierzchołka.

### Krzywe w modelu i adaptacyjna siatka do wyświetlania

Przybliżenie krzywej ma zależeć od dopuszczalnego błędu i rozmiaru na ekranie,
z cache poziomów szczegółowości oraz histerezą, aby drobny zoom nie przebudowywał
ciągle siatki. Do wyświetlania można przyjąć początkowy cel błędu poniżej około
0,5–1 piksela; to proponowany parametr do weryfikacji, nie stała geometrii CAD.
Dokładność obliczeń geometrycznych pozostaje oddzielna od jakości ekranu.

Rozróżnienie siatki i geometrii oraz wpływ zbyt małej tolerancji na rozmiar siatki
opisuje [Open CASCADE Mesh](https://occt3d.com/dev/doc/overview/html/occt_user_guides__mesh.html).

Podstawy z otworami wymagają triangulacji. Earcut jest rozsądnym kandydatem do
siatki wyświetlania poprawnych obrysów, ale nie zastępuje sprawdzania poprawności
topologii i nie gwarantuje poprawnych wyników dla wszystkich uszkodzonych danych:
[repozytorium Mapbox Earcut](https://github.com/mapbox/earcut).

### Złożone sceny i wybieranie

Przy wielu obiektach dodać indeks przestrzenny do przecięć i wybierania,
odrzucanie niewidocznych obiektów oraz instancje powtarzanych assetów. WebGL 2
udostępnia [rysowanie instancji](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/drawElementsInstanced).
Wybieranie powinno korzystać z aktualnej struktury sceny; nie wymaga ciągłego
odczytu pełnego bufora GPU na ruchu myszy.

Kosztowne przebudowy topologii można później przenieść do Workera. Worker chroni
responsywność interfejsu, ale nie usuwa zbędnych obliczeń ani nie zastępuje GPU.
Przekazywanie buforów powinno wykorzystywać transfer własności:
[MDN Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers).

## 6. Wybór technologii w tym projekcie

| Rozwiązanie | Ocena |
| --- | --- |
| Dalsze rozwijanie rastrowania pikseli w JS | Nie jako docelowy renderer. Niższy DPR i ponowne użycie buforów są tylko doraźnymi poprawkami. |
| Natywny WebGL 2 | Rekomendowany. Dostępny w sprawdzonym środowisku; możliwy w istniejącym `app.js`, bez CDN i procesu kompilacji. |
| Three.js | Przydatny gotowy silnik, lecz zależność biblioteczna wymagałaby uzgodnienia z zasadami aplikacji. Nie jest konieczny do usunięcia obecnego problemu. |
| WebGPU | Warto rozważyć później. Do obecnych prostych wyciągnięć nie trzeba uzależniać rozwiązania problemu od nowszego API. |
| Pełny kernel CAD, np. Open CASCADE lub CGAL przez WASM | Możliwy kierunek dla zaawansowanych operacji geometrycznych, ale istotnie większy zakres i pakiet niż obecne trzy pliki aplikacji. |

Dokumentacja [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
opisuje jego wymagania i dostępność. Nie przyjęto założenia, że sam nowszy standard
zagwarantuje większą płynność przy złym podziale pracy.

CGAL i Open CASCADE służą w tym researchu jako wzorce modelowania geometrii.
Nie są propozycją ich natychmiastowego dołączenia do aplikacji.

## 7. Kolejność wdrożenia i kryteria odbioru

1. Zachować benchmark; dodać regresje zoomu, ikon i przejścia przez XY/XZ/YZ.
2. Oddzielić kamerę 3D i wdrożyć zoom oraz jednolity pasek ikon.
3. Zastąpić renderer przez WebGL 2, z cache siatek i łączeniem żądań renderowania.
4. Przenieść granice powierzchni na referencje do krzywych i stabilne identyfikatory.
   Nie identyfikować powierzchni przez listę zaokrąglonych współrzędnych.
5. Dodać adaptacyjne próbkowanie wyświetlania, indeks przestrzenny i testy obciążenia.

Proponowany cel odbioru: na uzgodnionym sprzęcie i rozdzielczości płynny obrót
zwykłej sceny przy 60 Hz, z 95. percentylem pracy głównego wątku w budżecie około
5–10 ms i bez długich zadań powyżej 50 ms podczas obrotu niezmienianej sceny.
To cel do zmierzenia po wdrożeniu, nie gwarancja na każdym urządzeniu.
Przy 60 Hz cała klatka ma około 16,7 ms, z czego aplikacja nie powinna zużywać
całego budżetu: [web.dev Rendering performance](https://web.dev/articles/rendering-performance).

Sceny odbiorowe powinny obejmować 1, 10, 100 i 1000 obiektów, łuki, koła,
otwory, połączone obszary, skrajne wysokości, DPR 1/2 i obrót przez wszystkie
główne płaszczyzny. Należy raportować liczbę trójkątów, wywołań rysowania,
pamięć, czas CPU/GPU i opóźnienie interakcji. Sama liczba assetów nie określa kosztu:
tysiąc prostych instancji i tysiąc szczegółowych modeli to różne obciążenia.

Weryfikacja ma też potwierdzić, że obrót nie przelicza topologii, nie zmienia
modelu ani historii, a zoom nie zmienia rozdzielczości geometrii źródłowej.
