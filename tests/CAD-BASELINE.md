# Edytor rzutu aplikacji — stan po przebudowie CAD

Aktualizacja renderowania 3D: `PlanGpu` używa natywnego WebGL 2 i sprzętowego
testu głębokości; `PlanRaster` został usunięty. `PlanMesh` trianguluje obrysy
z otworami i buduje drzewo wybierania promieniem. Obrót korzysta z zapisanych
buforów GPU, a poziom szczegółowości krzywych zależy od przybliżenia z histerezą.
Model nadal przechowuje analityczne krzywe i logiczne powierzchnie.
Pomiary i zakres sprawdzeń: [3D-PERFORMANCE-RESULTS.md](3D-PERFORMANCE-RESULTS.md).

Materiały pomocnicze. Aplikacja uruchamia się bez kompilacji przez `index.html` i korzysta wyłącznie z `index.html`, `app.js` oraz `style.css`.

## Zasady modelu

- Punkt ma trwały `nodeId`. Nowe punkty nie łączą się przez samą równość współrzędnych.
- Wspólny identyfikator oznacza trwały wspólny wierzchołek. Dotyczy linii, łuków i krzywych Béziera.
- Starsze rzuty przechodzą jednorazową migrację: zachowane są współrzędne, istniejąca skala i blokady; wcześniejsze zbieżne punkty otrzymują wspólne identyfikatory zgodnie z dawnym zachowaniem.
- Wartości modelu mają stałą skalę `metersPerUnit`. Zmiana jednostek i dokładności opisów nie zmienia współrzędnych.
- Powierzchnia rysowania zajmuje cały widok, a interfejs jest na niej nakładany. Zaznaczanie i otwieranie właściwości nie dopasowuje ponownie widoku.
- Pomiar pokazuje aktualną geometrię. Wiązanie jest osobnym, jawnym ograniczeniem.
- W polach właściwości można zmienić wymiar jednorazowo. Zaznaczenie „Ustal” zachowuje go przy kolejnych operacjach.
- Nieudane dopasowanie pozostawia ostatnią poprawną geometrię; ograniczenia nie są automatycznie usuwane w celu wymuszenia ruchu.

## Obsługa

| Obszar | Działanie |
| --- | --- |
| Precyzja | Osobne ustawienia widoczności siatki, przyciągania do siatki, kroku i przyciągania do obiektów. |
| Łączenie końców | Można wyłączyć trwałe łączenie niezależnie od chwilowego przyciągania. |
| Przyciąganie | Końce, środki odcinków i łuków, centra, przecięcia, ćwiartki, najbliższe punkty oraz pomocnicze punkty prostopadłe i styczne. |
| Alt | Tymczasowo pomija przyciąganie podczas wskazywania i przesuwania punktów. |
| Shift przy rysowaniu | Kierunki co 45°, kwadrat podczas rysowania prostokąta. |
| Wybór | Kliknięcie, grupy, okno obejmujące od lewej do prawej i okno przecinające od prawej do lewej. |
| Segment polilinii | Ctrl/Cmd + kliknięcie wybiera pojedynczy segment. |
| Wierzchołki | Zaznaczone polilinie pokazują wszystkie wierzchołki; łuki i Béziery trzy punkty; okrąg środek i uchwyt promienia. |
| Ruch | Domyślnie przesuwane są wskazane elementy, a sąsiedzi dopasowują się do wiązań. W Precyzji można wybrać ruch całego powiązanego obrysu. |
| Rozłącz końce | Rozłącza zaznaczone elementy od pozostałych, zachowując ich wewnętrzne wspólne punkty. |
| Wiązania | Poziom, pion, kąt do osi, kąt między liniami, równoległość, prostopadłość, współliniowość, równość długości/promieni, zbieżność, punkt na obiekcie, współśrodkowość, styczność, symetria i gładkość G2. |
| Unieruchomienie | Osobno cały obiekt i pojedynczy punkt. Blokada edycji nadal ma osobne przyciski. |
| Usuwanie wiązań | Przy zaznaczeniu pokazane są etykiety aktywnych ograniczeń. Każdą można usunąć osobno. |
| Struktura polilinii | Dodawanie i usuwanie wierzchołków, rozdzielenie, połączenie oraz wydłużenie prostej do granicy. |
| Przycinanie | Linie, okręgi, łuki i kwadratowe Béziery. Przycinanie Béziera zachowuje kształt pozostawionych fragmentów. |
| Ochrona struktury | Operacja zmieniająca strukturę związanej geometrii wymaga zwolnienia kolidujących ograniczeń. Nie zmienia ustalonej długości na nową wartość. |
| Przekształcenia | Przesunięcie liczbowe, obrót, skala i kopia; przestrzegają istniejących ograniczeń. Kopie otrzymują niezależne identyfikatory. |
| Podkład | Właściwości rozmiaru i obrotu oraz kalibracja przez dwa punkty i znaną odległość. Kalibracja nie skaluje obrysu. |
| Cofanie | Ctrl/Cmd+Z, Ctrl+Y lub Ctrl/Cmd+Shift+Z oraz przyciski. Jedno przeciągnięcie jest jedną zmianą razem ze zmianami sąsiadów. |

## Płaszczyzna szkicu i powierzchnie

- Każdy szkic ma `outline.planeId` wskazujący płaszczyznę w `plan.planes`.
  Pierwszy szkic i dotychczasowe rzuty otrzymują domyślną poziomą płaszczyznę XY.
  Punkty szkicu pozostają współrzędnymi lokalnymi płaszczyzny. Płaszczyzna ma
  początek, dwie osie i normalną; jej przypisanie jest zapisywane ze szkicem.
- Nazwa „Rzut 1” pozostaje bez zmian. Płaszczyzna podparcia szkicu i powierzchnia
  ograniczona jego krawędziami są odrębnymi pojęciami. Wiele powierzchni może
  należeć do jednego szkicu na tej samej płaszczyźnie.
- Przycisk „Powierzchnie” jest dostępny wyłącznie w widoku 3D i włącza wybór
  zamkniętych obszarów. Kliknięcie zaznacza jeden obszar, Ctrl+kliknięcie dodaje
  go do zaznaczenia lub usuwa z zaznaczenia (na macOS także Cmd).
  W rzucie 2D nadal zaznacza się i edytuje geometrię szkicu.
- Wspólne krawędzie rozdzielają powierzchnie. Wewnętrzny zamknięty obrys tworzy
  otwór w otaczającej powierzchni i jednocześnie osobną powierzchnię.
  Linie pomocnicze i ukryte krawędzie nie zamykają obszarów.
- Powierzchnie są wyznaczane ponownie z aktualnej geometrii i początkowo mają
  grubość 0. Samo zaznaczanie nie zmienia
  geometrii ani historii. Zaznaczenie jest stanem bieżącej sesji.
- Powierzchnia ma zewnętrzną pętlę `outer` i pętle otworów `inner`. Krawędzie
  wskazują źródłowe odcinki, łuki kołowe lub kwadratowe Béziery oraz ich przedziały
  parametrów. Obszary powstają w miejscach rzeczywistych połączeń i przecięć krzywych.
  Koło bez przecięć ma jedną krawędź łukową; półkole z cięciwą ma dwie krawędzie.
- Pola są obliczane przez całkowanie granic krzywych, z uwzględnieniem otworów.
  Wynik nie zależy od gęstości siatki wyświetlania. Obliczenia korzystają z liczb
  zmiennoprzecinkowych JS i tolerancji numerycznych.
- `PlanFaces.mesh` tworzy oddzielne przybliżenie do wyświetlania. Zmiana jego
  tolerancji nie tworzy nowych powierzchni ani krawędzi w modelu szkicu.
- „Wyciągnij” rozpoczyna jedną operację na zaznaczonych powierzchniach.
  Uchwyt na widoku i pole wysokości w centymetrach zmieniają wyciągnięcie
  wzdłuż normalnej płaszczyzny. Wysokość może być dodatnia, ujemna lub zerowa.
- W trakcie operacji Ctrl+kliknięcie nadal dodaje lub odznacza powierzchnie.
  Nowe obszary przyjmują aktualną wysokość, odznaczone wracają do stanu sprzed
  operacji. Nie trzeba rozpoczynać wyciągania ponownie.
- Sąsiednie zaznaczone obszary tworzą wspólną bryłę bez ścian na wspólnych
  krawędziach. Otwory pozostają otworami, dopóki ich powierzchnie nie zostaną
  dodane do tej samej operacji. Rozłączne obszary współdzielą wysokość operacji.
- Wysokość zapisuje się bez zatwierdzania; przeciągnięcie zapisuje się po puszczeniu
  uchwytu. Escape i powrót do 2D zachowują wynik. Całą operację cofa Ctrl+Z.
  Wyciągnięcie można ponownie zaznaczyć i edytować.
  `outline.extrusions` przechowuje grupy identyfikatorów powierzchni i wysokość
  w metrach. Zapis lokalny oraz cofanie i ponawianie obejmują wyciągnięcia.
- Bryły mają górną i dolną powierzchnię oraz ściany zewnętrzne i ściany otworów.
  `PlanExtrusions.surfaces` zachowuje ścianę walcową wzdłuż łuku jako jeden fragment
  geometryczny; Bézier tworzy powierzchnię wyciągnięcia krzywej. Bieżący renderer
  nadal wyświetla te ściany za pomocą wielokątów, ale ich pomocnicze podziały
  nie są rysowane jako pionowe krawędzie ściany walcowej.
- Identyfikatory powierzchni wynikają z tożsamości krawędzi i fragmentów, a nie
  z listy współrzędnych. Przesunięcie lub zmiana promienia zachowująca topologię
  nie odłącza wyciągnięcia. Zmiana topologii obrysu może wymagać ponownego wyboru.
  Starsze identyfikatory współrzędnościowe są migrowane przy odczycie projektu;
  nieprzypisane stare dane są zachowywane.
- Kamera 3D ma niezależny zoom i przesunięcie od 2D. Kółko, +/− i „Dopasuj”
  działają w aktywnym widoku. Obrót zachowuje skalę; nie dopasowuje ponownie sceny.
  Środkowy przycisk lub Spacja z lewym przyciskiem przesuwają kamerę 3D.
  Narzędzia 3D mają ikony SVG, nazwy dostępne i podpowiedzi.
- Wymianę renderera i optymalizację obrotu opisano w aktualizacji na początku
  dokumentu. `3D-RESEARCH.md` zachowuje historyczne pomiary sprzed tej zmiany.
- Tworzenie i pochylanie nowych płaszczyzn pozostają kolejnym etapem.

## Wymiary

- Odcinek: długość rzeczywista, rzut poziomy lub pionowy.
- Polilinia: łańcuch oraz całkowita szerokość lub wysokość obrysu.
- Równoległe linie: odległość prostopadła; może działać jako pomiar albo jawnie ustalona odległość.
- Okrąg i łuk: promień, średnica; dla łuku także długość po krzywiźnie.
- Kąt: pomiar między liniami oddzielony od ustalenia jego wartości.
- Przeciąganie liczby przesuwa linię wymiarową albo opis. Nie zmienia obrysu.
- Wymiary całkowite i odstępy korzystają z identyfikatorów obiektów, a nie z zapisanych na stałe kopii współrzędnych.
- Brak równoległości po zmianie mierzonej pary jest oznaczany zamiast wyświetlania fałszywego odstępu.
- Wymiar można usunąć; skojarzone z nim wiązanie odległości jest wtedy usuwane razem z nim.
- Jednostki: m, cm, mm; dokładność opisów od 0 do 4 miejsc. Pełne współrzędne pozostają w modelu.
- Symbol `•` przy wartości oznacza ustalony wymiar.

## Zapis i historia

Geometria, identyfikatory, wiązania, wymiary, położenia opisów i ustawienia zapisują się w IndexedDB. Historia rzutu ma do 50 stanów w bieżącej sesji i jest pusta po ponownym załadowaniu strony. Historia biblioteki obrazów pozostaje oddzielna.

## Sprawdzone scenariusze

Testy pomiarów między punktami dwóch obiektów sprawdzają odległość prostą,
poziomą i pionową oraz brak deformacji mierzonej geometrii. Różne pary typów
obiektów i punktów określają zakres sprawdzeń. Plik tych testów to
`cad-02-point-measurements.test.cjs`; szczegóły opisuje `CAD-TOOLS-TESTS.md`.

| Test | Plik |
| --- | --- |
| Tożsamość punktów, brak przypadkowego złączenia, 107°, powiązanie linii z łukiem, podstawowe relacje | `cad-foundation.cjs` |
| Podział, usuwanie wierzchołka, połączenie, wydłużenie, chronione przycinanie, dokładny podział Béziera, symetria, styczność, G2 | `cad-editing.cjs` |
| Pomiar kontra wiązanie, 107° przy przeciąganiu złączenia, cofanie, blokady, wybór obszarowy, jednostki, kopie, promień, unieruchomiony punkt, wymiary rzutowane, kalibracja | `cad-foundation-browser.cjs` |
| Operacje strukturalne i tworzenie/usuwanie relacji przez interfejs, konflikty, prostokątność, wyłączenie automatycznych połączeń | `cad-editing-browser.cjs` |
| Wymiary całkowite, odstęp sterujący, przeciąganie opisów, średnica, długość łuku, usuwanie i cofanie | `cad-dimensions-browser.cjs` |
| Położenie i skala rysunku podczas otwierania panelu | `selection-scale.cjs` |
| Zachowanie starszego rzutu, podkładu, skali i blokad | `plan-migration.cjs` |
| Parser metadanych, zmniejszanie i zapis obrazów | `parser.cjs`, `save-image.cjs`, `storage.cjs` |

Uruchomienie bieżącego zestawu: `node tests/cad-suite.cjs`. Testy przeglądarkowe używają lokalnego Edge i narzędzi testowych znajdujących się w `tests`; nie są zależnością aplikacji.

## Granice tego etapu

- Solver numeryczny ma ograniczoną liczbę iteracji. Komunikat o konflikcie wskazuje ograniczenia do sprawdzenia; nie wyznacza minimalnego zestawu sprzecznych równań ani liczby stopni swobody.
- Wydłużanie do granicy dotyczy odcinków prostych. Usuwanie wierzchołka łączy dwa proste segmenty.
- Gładkość dotyczy połączeń z kwadratową krzywą Béziera; pełny edytor splajnów NURBS i dowolnych stopni nie jest częścią tego modelu.
- Parametry są liczbowe. Brak edytora równań, arkuszy wydruku i formatów DWG/DXF.
- Główna płaszczyzna rzutu pozostaje stała. Obracanie UCS i operacje 3D pozostają osobnym etapem.
