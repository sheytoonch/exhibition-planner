# Regresje ze zgłoszeń użytkownika

Uruchomienie z katalogu projektu: `node tests/cad-suite.cjs`.
Wymagane: Node.js, Playwright (`npm.cmd ci --prefix tests`) oraz Microsoft Edge.
Aplikacja aplikacji nie wymaga tych narzędzi do działania.

| Zgłoszenie | Testy |
| --- | --- |
| Zawieszanie obrotu 3D i przebudowy przy ruchu kamery | `3d-cache.test.cjs`: brak ponownej budowy granic i zmiany rozmiaru canvasu przy obrocie; `3d-controls.test.cjs`: poziomy szczegółowości zależne od zoomu, zachowanie buforów przy obrocie; `3d-benchmark.cjs`: długie obroty przez XY/XZ/YZ, DPR 1/2 |
| Poprawność renderera GPU i trwałość projektu | `gpu-mesh.test.cjs`: triangulacja otworów, wklęsłości i wybieranie promieniem; `gpu-browser.test.cjs`: rzeczywiste piksele głębokości, otwory, zachowanie wyboru i buforów, brak WebGL, odtworzenie kontekstu, zwalnianie tekstur po wymianie podkładów |
| Zoom i ikony w 3D; niezależność kamery 2D; obrót zachowuje zoom | `3d-controls.test.cjs`: widoczność kontrolek, SVG narzędzi, zoom przyciskami i kółkiem, dopasowanie, zachowanie geometrii i kamery 2D |
| Łuki i powierzchnie jako krzywe, niezależnie od wielokątów wyświetlania | `curved-faces.test.cjs`: granice analityczne, pola, przecięcia i styczności, nakładające się łuki, Béziery, ściany walcowe, stabilne identyfikatory i migracja; `curved-surfaces-browser.test.cjs`: rzeczywiste rysowanie i edycja koła, zachowanie wyciągnięcia, cofanie, ponawianie i odświeżenie |
| Szkic na poziomej płaszczyźnie XY; osobne zaznaczanie zamkniętych powierzchni o grubości 0 | `sketch-faces.test.cjs`: przypisanie płaszczyzny, wspólne krawędzie, przecięcia, otwory, łuki, koła, Béziery, granice pomocnicze i ukryte; E2E zaznaczania z Ctrl w 3D, pięć obszarów podobnych do przykładu użytkownika i zapis szkicu |
| Wybór powierzchni wyłącznie w 3D; wspólne wyciąganie i zmiana zestawu przez Ctrl podczas operacji | `extrude.test.cjs`: brak narzędzia w 2D, dodawanie i usuwanie obszarów podczas wyciągania, brak ścian wewnętrznych, otwory i poprawne zasłanianie, uchwyt, wysokość liczbowa, zapis bez zatwierdzania, Escape zachowujący wynik, wartości dodatnie/ujemne/zero, ponowna edycja, cofanie całej operacji, ponawianie i zapis |
| Poprawne odległości między punktami dwóch obiektów bez deformowania ich geometrii | `cad-02-point-measurements.test.cjs`: pomiary proste, poziome i pionowe dla różnych typów obiektów i ich punktów referencyjnych |
| Współliniowa kontynuacja linii, łuków i krzywych Béziera | `curve-continuity.test.cjs`: osiem kombinacji, wspólny węzeł, styczność, ruch i zapis |
| Drugi koniec łuku pozostaje na miejscu podczas przesuwania linii | `curve-drag-e2e.test.cjs`: rzeczywiste przeciąganie w przeglądarce, kontrola końca, styczności i odświeżenia |
| Blokowanie ruchu w różnych kierunkach i przeniesienia linii pod łuk | `curve-drag-e2e.test.cjs`: cztery kierunki, w tym duże przesunięcie w dół; `major-arc-movement.cjs`: jednostkowe przypadki obu elementów i różnych położeń punktu pośredniego |
| Wymiary po lewej, wiązania po prawej; kliknięcie, dwuklik i Delete | `compact-inspector.test.cjs`: edycja wymiaru i kąta, zwalnianie pojedynczych wiązań bez usuwania geometrii |
| Same napisy, bez paneli, przyciskowego tła i stałych dopisków | `compact-inspector.test.cjs`: style w obu motywach, ukryte komunikaty i formularz, menu operacji tylko na żądanie |
| Przeciąganie końca swobodnej linii nie rusza drugiego końca | `compact-inspector.test.cjs`: wielokrotne przeciąganie obu końców; `constraints.cjs`: ruch w solverze i zachowanie jawnych ograniczeń |
| Przeciąganie wolnego końca poziomej linii nie przesuwa połączonej pionowej linii w bok | `hv-endpoint.test.cjs`: jednostkowy test solvera i E2E wielokrotnych przeciągnięć, stała pozycja pionu i jego drugiego końca, zmiana długości, zachowanie H/V i odświeżenie |
| Brak automatycznych wymiarów i niezamierzonego ustalania długości | `compact-inspector.test.cjs`: brak etykiet przed żądaniem pomiaru; opuszczenie niezmienionej wartości nie tworzy ograniczenia |
| Pusta wartość i liczby z przecinkiem w edytorze | `compact-inspector.test.cjs`: przywracanie wartości po pustej edycji i zapis liczby z przecinkiem |
| Kliknięcie wymiaru dotyczy wymiaru, a nie geometrii | `compact-inspector.test.cjs`: przeciąganie etykiety, Delete, cofanie i dwuklik na rzucie; `cad-point-behavior.test.cjs`: usuwanie wymiaru fragmentu łuku |
| Linie i łuki pomocnicze oraz warstwy | `layers-construction.test.cjs`: migracja istniejących obiektów, oddzielenie geometrii pomocniczej od granic powierzchni, przyciąganie do końców, zmiana rodzaju bez utraty połączeń, tworzenie i wybór warstwy, przenoszenie zaznaczenia, widoczność, blokady, cofanie i zapis po odświeżeniu |
| Wierzchołek wybierany bez wcześniejszego zaznaczenia linii i niezależnie od niej | `vertex-selection.test.cjs`: grupowanie końców według tożsamości węzła, niezależne rozłączone wierzchołki, bezpośredni wybór wspólnego punktu trzech linii, wybór po zaznaczeniu linii, zachowanie pozostałych końców, cofanie, ponawianie i odświeżenie |
| Zawsze rysuj na default; przenoś zaznaczenie kliknięciem warstwy; pytaj o zawartość przy usuwaniu | `layer-workflow.test.cjs`: zachowanie istniejących przypisań, rysowanie na default mimo dodania innej warstwy, rzeczywiste zaznaczanie wielu linii z Shift, przeniesienie kliknięciem, anulowanie usuwania, usunięcie zawartości lub przeniesienie na default, oczyszczanie zależności, ochrona default, cofanie, ponawianie i zapis |
| Tylko obracanie rzutu w 3D, bez wysokości i nowych obiektów | `orbit-3d.test.cjs`: jednostkowe sprawdzenie obrotu i zachowania odległości, przeciąganie widoku w przeglądarce, zmiana renderowanego obrazu, powrót do identycznego 2D, brak modyfikacji geometrii i historii oraz zapis po odświeżeniu |
| Kulka orientacji i trzy klikalne płaszczyzny | `orbit-gizmo.test.cjs`: poprawna matematycznie orientacja XY/XZ/YZ, kliknięcie płaszczyzny bez dodatkowych przycisków tekstowych, obsługa klawiaturą, powrót do izometrii, aktualizacja manipulatora po obrocie, ukrywanie w 2D oraz brak zmian w modelu |
| Obrót nie może zatrzymywać się na widoku krawędziowym | `orbit-3d.test.cjs`: jednostkowe przekraczanie obu biegunów i wielokrotnych pełnych obrotów; rzeczywiste kolejne przeciągnięcia w obu kierunkach ponad 360°, kontrola orientacji osi i niezmienności geometrii |
| Dodatkowa płaszczyzna przywracająca domyślny widok | `orbit-gizmo.test.cjs`: domyślna orientacja izometryczna, kliknięcie nowego celu na manipulatorze po swobodnym obrocie, przywrócenie współrzędnych osi i płaszczyzn oraz niezmieniona geometria |
| Domyślna płaszczyzna stanowi część manipulatora, a strzałki umożliwiają obrót | `orbit-gizmo.test.cjs`: domyślna płaszczyzna zmienia projekcję razem z pozostałymi elementami; `orbit-arrows.test.cjs`: jednostkowy obrót wokół każdej osi z widoków standardowych, rzeczywiste kliknięcia i przeciąganie każdej strzałki, kontrola kąta, obsługa klawiatury i niezmienność modelu |

`cad-suite.cjs` jest zarejestrowanym zestawem regresji CAD, a nie automatycznym
uruchomieniem wszystkich historycznych, samodzielnych skryptów w tym katalogu.
Wskaźnik ostatniego pełnego uruchomienia to `tests/test-runs/latest-full.json`; wskazuje właściwy `summary.json`.
