# Wymagania i testy

Każdy nowy wymóg lub błąd musi mieć test akceptacyjny/regresyjny. Nowe pliki `*.test.cjs` są wykrywane automatycznie; klasyfikację określa `test-inventory.json`. Istniejące skrypty proceduralne są jawnymi scenariuszami i liczą się jako jeden przypadek na skrypt, nie jako liczba jego asercji.

| Zachowanie | Zestawy |
|---|---|
| Kliknięcie poza figurą kończy narzędzie i zachowuje wyciągnięcie | `extrude.test.cjs` |
| Odtworzenie 3D, kamery i powiększenia | `orbit-3d.test.cjs`, `exhibition.test.cjs` |
| Ściany, nazwy, wybór wielu płaszczyzn, scalanie z zachowaniem otworów i prac | `exhibition.test.cjs`, `geometry-properties.test.cjs` |
| Format obrazów, grubość, rozmieszczanie, puste obrazy i brak duplikatów między rzutami | `exhibition.test.cjs` |
| Wymiary, linie, odległości, przeciąganie podpisów, dokładność i zapis | `exhibition.test.cjs`, `dimension-drag.cjs`, `cad-02-point-measurements.test.cjs` |
| Perspektywa, skoki 45°, obrót, głębokość i otwory | `exhibition.test.cjs`, `orbit-arrows.test.cjs`, `gpu-browser.test.cjs`, `gpu-mesh.test.cjs` |
| Brak zmian geometrii przy pomiarach; wszystkie kombinacje obiektów | `cad-02-point-measurements.test.cjs`, `cad-02-between-objects.test.cjs` |
| Kolejka, rozliczenie przypadków, błędy, blokady, historia i wersja kodu | `cad-runner.test.cjs`, `cad-scheduler.test.cjs` |
| Historia kolejności po zmianie liczby workerów, puste próbki i wykorzystanie najbliższej dostępnej historii bez mieszania wyników | `cad-scheduler.test.cjs` |
| Wszystkie pary punktów mierzone kolejno po jednym wyborze trybu; każda para dodaje nowy wymiar właściwego typu | `cad-02-point-measurements.test.cjs` |
| Minimalny wspólny interfejs, miejsce na obiekt, stabilny panel obrazów, zwijanie i zapis, niezależna nawigacja przy imporcie, klawiatura i menu | `workspace-ui.test.cjs` |
| Ikony narzędzi, kamera/obrót/zoom przy płótnie, osobna widoczność i przyciąganie, nawigacja po ścianach z 2D, ustawienia jednostek przy rzucie | `workspace-ui.test.cjs`, `cad-foundation-browser.cjs`, `orbit-gizmo.test.cjs`, `exhibition.test.cjs` |
| Drugie kliknięcie ikony zamyka opcje (mysz i klawiatura); jawne 2D/3D, powrót do edycji z zachowaniem wyciągnięcia | `workspace-ui.test.cjs`, `extrude.test.cjs`, `orbit-3d.test.cjs` |
| Automatyczne zwiększanie/zmniejszanie limitu workerów według CPU i RAM, bez przerywania testów i bez utraty przypadków | `cad-scheduler.test.cjs`, `cad-runner.test.cjs`; pełne porównanie 1/4/auto |
| Podsumowanie użycia CPU, liczby workerów i dostępnych procesorów logicznych w czasie testów; ekwiwalent wątków i brakujące pomiary bez fałszywej precyzji | `cad-scheduler.test.cjs`, `cad-runner.test.cjs` |

Wygląd i zachowanie sprawdzane są liczbowo, bez zrzutów i bez AI. Poprawny wynik wymaga przejścia każdego zaplanowanego zadania i przypadku; nie dowodzi braku wszystkich możliwych błędów aplikacji.

- Domyślne światło i uproszczone cienie 3D: `gpu-mesh.test.cjs` (zacienienie i przesłanianie), `gpu-browser.test.cjs` (rzeczywiste wyciągnięcie, aktywne oświetlenie i ponowne użycie buforów przy obrocie).
- Spójny kierunek światła, normalne góry i spodu, cień wewnątrz dużych trójkątów, otwory oraz brak ukośnych gradientów od triangulacji: `gpu-mesh.test.cjs`, `gpu-browser.test.cjs`. Cień jest sprawdzany przez odczyt pikseli GPU, a okrągły otwór i wyciągnięcie przez rzeczywiste działania UI; obrót kamery zachowuje mapę światła.
- Czytelne różnice jasności ścian pod różnymi kątami także po stronie odwróconej od światła; ciągły światłocień łuku: `gpu-mesh.test.cjs` (kierunkowe wypełnienie), `gpu-browser.test.cjs` (różnice pikseli GPU oraz rzeczywiste wyciągnięcie ścian z otworem).
- Trzy ciągłe łuki obrotu XY/XZ/YZ: ćwiartka z przedłużeniami po 22,5° (łącznie 135°), połączone przeciwne groty na obu końcach, klikalne tylko końcówki; zgodny kierunek, klawiatura i przeciąganie: `orbit-arrows.test.cjs` (geometria, ciągłość SVG i rzeczywiste kliknięcia wszystkich sześciu grotów), `orbit-gizmo.test.cjs` (wybór płaszczyzn).
- Powiększony manipulator i groty, obszar kliknięcia z marginesem przy każdej końcówce, kursor wskaźnika na strzałkach i rączka tylko przy przesuwaniu; brak dodatkowych strzałek pod kołem, skoki kamery dostępne w ustawieniach: `orbit-arrows.test.cjs` (kliknięcia grotów oraz obok nich), `orbit-gizmo.test.cjs`, `3d-controls.test.cjs`, `workspace-ui.test.cjs`, `exhibition.test.cjs`.
- Groty są trójkątami w płaszczyznach obrotu, rzutowanymi wspólnie z łukami, bez płaskich markerów SVG: `orbit-arrows.test.cjs` sprawdza współpłaszczyznowość i skrót przy patrzeniu wzdłuż płaszczyzny oraz rzeczywiste przełączanie widoków domyślnego, XY, XZ i YZ; zachowuje kliknięcia, przeciąganie i margines trafienia.
- Biel i neutralne szarości płaskich figur, brył oraz krawędzi przy zachowaniu oświetlenia i kolorowych prac: `gpu-browser.test.cjs` (rzeczywiste wyciągnięcie i neutralne składowe RGB materiałów), `exhibition.test.cjs` (wybór szarych ścian, pusty obraz i kolorowe tekstury prac).
- Edycja geometrii 2D zachowuje wyciągnięcia po zmianie identyfikatorów i podziale powierzchni, bez zmiany wysokości innych brył; zapis obszarów, odzyskiwanie starszych przypisań, cofanie/ponawianie i przeładowanie: `extrude.test.cjs` (rzeczywista edycja wyciągniętego koła, siatka brył, migracja i ochrona przed niejednoznacznym lub obcym przypisaniem).
- Odzyskiwanie starszego półkola po przesunięciu przecinającej linii, także przy odwróconym kanonicznym kierunku starego identyfikatora i pustych zapisanych obszarach: `extrude.test.cjs` (test jednostkowy oraz otwarcie historycznego zapisu w przeglądarce, render obu części i trwałość naprawy po kolejnym odświeżeniu).
- Wstawienie punktu i podział prostej dwuklikiem w trybie zaznaczania lub przez menu linii: `insert-point.test.cjs`, `cad-editing-browser.cjs`. Nowy punkt łączy oba odcinki i daje się przeciągać; zachowane są końce, odwołania pomiarów, blokady warstw, cofanie/ponawianie i zapis po przeładowaniu.
- Strzałki rozwijania wariantów są wyśrodkowane bezpośrednio pod własnymi ikonami, również przy węższym widoku, i otwierają właściwe menu: `workspace-ui.test.cjs`.

- Podpisana wstążka z grupami zadań, kontekstem 2D/3D i menu pod własnymi ikonami: `ribbon-sketch.test.cjs`, `workspace-ui.test.cjs`.
- Metody okręgów 2P/3P, promień/średnica i styczność do prostych; łuki AutoCAD/Inventor, środek, styczność, promień i podpisany kąt; wskazówki, wpis liczbowy, Escape i historia: `ribbon-sketch.test.cjs`, `sketch-methods.test.cjs`. Źródła i zasady: `docs/AUTODESK-RIBBON-AND-SKETCH.md`.

- Osobne zakładki tworzenia ścian i układania ekspozycji; zatwierdzenie nie otwiera doboru obrazów, dwuklik otwiera ścianę i aktywuje układ, powrót zachowuje ścianę: `exhibition.test.cjs`, `workspace-ui.test.cjs`.

- Powrót z niedokończonego wyboru ściany do szkicu 2D usuwa przycisk zatwierdzenia i zaznaczone fragmenty; ponowne wejście zaczyna pusty wybór: `exhibition.test.cjs`.

- Kandydaci na ścianę są zieloni, istniejąca ściana pod kursorem niebieska, zaznaczona mocniej niebieska; warstwa SVG jest widoczna. Dodawanie i odejmowanie pojedynczych fragmentów zachowuje obrazy i zapis, blokuje usunięcie zajętego obszaru: `exhibition.test.cjs`.

- Wymiarowanie ściany z uskokami ma łańcuch odcinków bliżej obrysu i wymiar całkowity dalej, w obu osiach. Suma odcinków pokrywa cały wymiar; współliniowe punkty i prostokąty nie dodają zbędnych wymiarów. Podpisy mieszczą się na płótnie również po zwężeniu i odświeżeniu: `exhibition.test.cjs` (test jednostkowy i E2E).

- Pomocnicze linie łączące obrys z wymiarami są przerywane; linie wymiarowe i kreski końcowe pozostają ciągłe, również po zmianie szerokości i odświeżeniu: `exhibition.test.cjs`.
# Wiązanie punktu z linią i zamknięcie łuku

Zapisane wiązanie `pointOn` łączy koniec elementu z wnętrzem odcinka w granicach dokładności solvera, bez zmiany danych szkicu i bez domykania niezwiązanych lub większych szczelin. Regresja na współrzędnych użytkownika: `curved-faces.test.cjs`; wybór obszaru, wyciągnięcie i ponowne wczytanie: `curved-surfaces-browser.test.cjs`.

# Nazwa ściany pod kursorem

W widoku ścian ekspozycji najechanie na zapisaną ścianę pokazuje subtelną nazwę obok kursora (także domyślną i dla ściany złożonej z fragmentów). Etykieta nie przechwytuje myszy, wyświetla nazwę jako tekst i znika po opuszczeniu ściany, rozpoczęciu przeciągania lub zmianie trybu: `exhibition.test.cjs`.

# Jedna aplikacja i niezależne zależności testowe

Repozytorium zawiera wyłącznie obecną aplikację w katalogu głównym. Testy mają własny manifest i plik blokady zależności w `tests`, nie odwołują się do usuniętej wersji. Sprawdzenie struktury: `repository-layout.test.cjs`; działanie po usunięciu starej aplikacji sprawdza pełny zestaw jednostkowy i E2E.

# Nazwy na listach ścian

Listy wyboru ścian w widoku ekspozycji i edytorze pokazują wyłącznie nazwę (domyślną lub nadaną przez użytkownika), bez wymiarów. Sprawdzenie obu list przed i po zmianie nazwy: `exhibition.test.cjs`.

# Jednoznaczna nawigacja projektu

Główna zakładka nosi nazwę „Projekt”. Układ ekspozycji nie ma osobnego przycisku „← 3D”; przejścia odbywają się przez istniejące zakładki widoków. Sprawdzenie nazwy i braku przycisku: `workspace-ui.test.cjs`; przejścia między układem i ścianami z zachowaniem prac: `exhibition.test.cjs`.

# Menu edycji ściany

Menu ma dwa równe przyciski „Dodaj fragment” i „Odejmij fragment” w jednym rzędzie oraz oddzielony separatorami przycisk zatwierdzenia na całą szerokość. Tryb aktywny jest wyróżniony, a usunięcie ściany ma osobny kolor. Etykiety, geometria menu i ochrona prac przy usuwaniu: `exhibition.test.cjs`.

# Odległość obrazu od brzegu poza ścianą

Poziomy wymiar pomiędzy obrazem a brzegiem ściany leży nad ścianą dla górnego rzędu albo pod ścianą dla dolnego. Starsze położenia wewnątrz ściany są korygowane przy wyświetlaniu, bez zmiany danych. Ręczne położenia po właściwej stronie pozostają zachowane. Test jednostkowy i rzeczywista edycja odległości: `exhibition.test.cjs`.

# Stała widoczność wszystkich wymiarów ekspozycji

Automatyczne wymiary każdego obrazu i linii pozostają widoczne bez zaznaczenia, podczas używania narzędzi i po odświeżeniu. Położenia etykiet należą do konkretnych obiektów, a kliknięcie wymiaru edytuje właściwy obiekt. Dopasowanie widoku uwzględnia pełne granice rysunku i opisów, w tym wymiar całkowity ściany oraz ręcznie przesunięte opisy. Sprawdzenie wielu obrazów, zmiany narzędzia, odświeżenia, wąskiego okna i edycji odległości: `exhibition.test.cjs`.

# Jedno narzędzie linii w układzie ekspozycji

W układzie ekspozycji każda linia służy jako pomoc do rozmieszczania prac. Jest jedno narzędzie „Linia pomocnicza” z ikoną przerywanej linii, bez przełącznika linii zwykłej i pomocniczej. Również wcześniejsze linie mają wspólny styl pomocniczy; wymiarowanie, przesuwanie, przyciąganie i zapis pozostają obsługiwane: `exhibition.test.cjs`.

# Poziome i pionowe linie pomocnicze ekspozycji

Jedno narzędzie wybiera kierunek poziomy lub pionowy według dominującego ruchu kursora. Podgląd i zapis używają tego samego przyciągania i wyboru osi, bez odcinków ukośnych. Test jednostkowy czterech kierunków oraz E2E podglądu, narysowania obu osi i odświeżenia: `exhibition.test.cjs`.

# Jeden wymiar między obrazami i poziome wymiary według rzędów

Odległość między tą samą parą krawędzi jest rysowana raz, niezależnie od kierunku pomiaru; odrębne odległości o równej wartości pozostają widoczne. Poziome wymiary układu trafiają nad lub pod ścianę według rzędu prac. Wymiar całkowity znajduje się najwyżej także po ręcznym przesunięciu opisów. Test kluczy pomiaru, wielu prac i położeń etykiet: `exhibition.test.cjs`.

# Wymiary dolnego rzędu pod ścianą

Wyraźnie oddzielony dolny rząd ma poziome wymiary pod ścianą; pojedyncza praca i prace górne są wymiarowane nad nią. Ręczne położenia po przeciwnej stronie są korygowane. Linie pomocnicze zaczynają się od najbliższej krawędzi obrazu, a pionowe odstępy pozostają bezpośrednio między pracami. Jednostkowo sprawdzane są przypisanie rzędów i zapisane położenia, E2E trzy prace oraz odświeżenie: `exhibition.test.cjs`.

# Płynne przeciąganie prac przy wymiarach i przyciąganiu

Podczas przeciągania zachowane są elementy SVG obrazów i stały widok ściany. Aktualizowane są przesuwany obiekt, wymiary i znaczniki przyciągania; biblioteka i dopasowanie całego rysunku nie są przebudowywane przy każdym ruchu. Wymiary pozostają widoczne, a ostateczna pozycja zostaje zapisana. E2E czterech prac, rzeczywistych ruchów myszy przez linie wyrównania, liczby odczytów układu oraz odświeżenia: `exhibition.test.cjs`.

# Wymiary między obrazami bez wystających końcówek

Linia wymiarowa odstępu między obrazami zaczyna się i kończy dokładnie na mierzonych krawędziach. Linie pomocnicze nie mają przedłużenia poza wymiar, a ukośne kreski końcowe są przycięte do odstępu z zachowaniem kąta. Jednostkowo sprawdzane są obie osie i kierunki; E2E sprawdza wszystkie odcinki pionowego wymiaru między dwiema pracami: `exhibition.test.cjs`.

# Pionowe odstępy bez bocznych linii pomocniczych

Pionowy wymiar między obrazami leży w środku wspólnego zakresu ich szerokości i łączy bezpośrednio dolną oraz górną krawędź prac. Nie tworzy bocznych przerywanych odcinków. Starsze pozycje poza tym zakresem są korygowane; ręczne przesunięcia w obrębie wspólnego zakresu pozostają zachowane. Jednostkowo sprawdzane są dwie górne prace nad dolną, E2E wąskiego nakładania szerokości: `exhibition.test.cjs`.

# Szerokości rzeczywistych obrazów

Każdy obraz z biblioteki ma stały wymiar szerokości między lewą a prawą krawędzią, umieszczony przy wymiarach jego rzędu. Wymiar pozostaje widoczny bez zaznaczenia i po odświeżeniu. Jest informacyjny, bez zmiany zadanych wymiarów pracy; szerokość pustej ramki nadal można edytować. E2E dwóch rzeczywistych obrazów o szerokości 80 cm i odświeżenia: `exhibition.test.cjs`.

# Bezpośredni wybór aksonometrii i perspektywy

W widoku 3D przełącznik „Aksonometria / Perspektywa” jest widoczny bez otwierania ustawień kamery. Wybrana projekcja zmienia rzeczywiste renderowanie, nie modyfikuje geometrii i zostaje odtworzona po odświeżeniu. E2E: `3d-controls.test.cjs`; ustawienia kamery i obsługa klawiatury: `workspace-ui.test.cjs`.

# Jednolite cieniowanie w perspektywie

Typ powierzchni jest przekazywany do fragmentów GPU bez interpolacji perspektywicznej. Płaskie powierzchnie zachowują cieniowanie na całym obszarze, bez białych pasów. E2E odczytu rzeczywistych pikseli wnętrza pojedynczej płaszczyzny: `gpu-browser.test.cjs`; stabilność głębokości podczas przybliżania: `3d-controls.test.cjs`.

# Bez powielonego przycisku wystawy

Nie ma osobnego przycisku „Wystawa” dublującego zakładkę „Ściany ekspozycji”. Panel „Modelowanie” zawiera narzędzia modelowania, a wybór i edycja ścian pozostają dostępne z zakładek. Brak przycisku i obsługa widoków: `workspace-ui.test.cjs`; wybór ścian i zachowanie prac: `exhibition.test.cjs`.

# Bez pustego panelu w widoku ścian

W widoku ścian ekspozycji nie jest wyświetlana pusta wstążka z podpisem „Modelowanie”. Górny pasek zajmuje tylko wysokość zakładek; narzędzia modelowania nadal należą do widoku modelu 3D. E2E braku pustego panelu i wysokości paska: `workspace-ui.test.cjs`.

# Swobodne przesuwanie wymiarów i powrót do startu

Automatyczne rozmieszczenie obowiązuje do ręcznego przesunięcia wymiaru. Pozycja nadana przez użytkownika ma pierwszeństwo także wewnątrz ściany lub poza wspólną szerokością obrazów. Przeciąganie zachowuje stałą skalę i widok, nie wymusza siatki oraz nie przerzuca etykiety na drugą stronę linii. Powrót kursorem w pobliże punktu startu przywraca dokładne wcześniejsze położenie; Escape anuluje zmianę. E2E obu osi, przejścia przez granicę automatycznego rozmieszczenia, powrotu i odświeżenia oraz jednostkowe zachowanie ręcznych offsetów: `exhibition.test.cjs`.

# Poziome wymiary poza ścianą po puszczeniu myszy

Poziome pomiary pozostają swobodne podczas przeciągania. Po puszczeniu myszy pozycja wewnątrz ściany trafia nad albo pod nią, przy bliższej krawędzi. Dotyczy to także wcześniej zapisanych pozycji. Pionowe wymiary zachowują ręczne położenie. E2E i testy jednostkowe: `exhibition.test.cjs`.

# Łańcuch przerwa – szerokość – przerwa dla każdego rzędu

Poziome wymiary tworzą ciąg od lewego do prawego brzegu ściany: przerwa, szerokość pracy, następna przerwa i szerokość, ostatnia przerwa. Sąsiedztwo poziome jest wyznaczane w obrębie tego samego rzędu także dla prac na nieco różnych wysokościach. Nie powstają poziome pomiary do prac z innego rzędu. Pionowe odstępy nadal korzystają z rzeczywistego nakładania szerokości. E2E dwóch rzędów, ciągłości odcinków, sumy równej szerokości ściany i odświeżenia: `exhibition.test.cjs`.

# Łańcuchy odpowiadających sobie krawędzi poza ścianą

Nad ścianą łańcuch górnego rzędu łączy kolejne lewe krawędzie prac; pod ścianą łańcuch dolnego rzędu łączy kolejne prawe krawędzie. Krańce łańcucha dochodzą do brzegów ściany. Szerokości są pokazywane w osobnym paśmie bliżej ściany, bez przeplatania ich z pomiarami położenia. E2E ciągłości i położenia obu łańcuchów oraz jednostkowe różnice pomiarów dla nierównych szerokości: `exhibition.test.cjs`. Zastępuje to wcześniejszy łańcuch przerw i szerokości.

# Etykieta zawsze nad linią wymiarową

Poziome etykiety wymiarów są zawsze nad swoją linią, również pod dolną krawędzią ściany. Obrócone etykiety pionowe są po lewej stronie linii. Strona nie zależy od kierunku pomiaru, rzędu ani ręcznego położenia. E2E obu osi, kilku prac, odznaczenia, narzędzi, odświeżenia i wąskiego okna: `exhibition.test.cjs`.

# Dolne zakładki ścian jak arkusze

Wybór ściany odbywa się przez pasek nazw na dole widoku, zamiast rozwijanych list w nagłówku. Aktywna zakładka jest wyróżniona i odtwarzana po odświeżeniu. Zakładki obsługują kliknięcie, strzałki oraz Home/End, a ich nawigacja nie przesuwa prac. Długie nazwy są skracane, cały pasek przewija się poziomo; kontrolki widoku i edytor pozostawiają mu miejsce. E2E dwóch ścian, klawiatury, zachowania prac, nazw i odświeżenia: `exhibition.test.cjs`; układ i dostęp z 2D: `workspace-ui.test.cjs`.

# Strzałki i lista wyboru ściany na dolnym pasku

Początek paska ma przyciski poprzedniej i następnej ściany, nieaktywne na krańcach. Na końcu jest strzałka otwierająca listę wszystkich ścian z wyróżnieniem aktywnej. Wybór otwiera właściwy układ i przewija jego zakładkę do widoku. Lista obsługuje klawiaturę i Escape. E2E obu strzałek, wyboru konkretnej ściany i zamknięcia listy: `exhibition.test.cjs`.

# Zmiana nazwy układu bezpośrednio w zakładce

Dwuklik na nazwie dolnej zakładki (lub F2) zastępuje nazwę polem tekstowym w tym samym miejscu. Enter i opuszczenie pola zapisują nazwę, Escape anuluje, puste pole nie usuwa nazwy. Nie ma przycisku z trzema kropkami ani okienka nazwy. Zmiana jest zapisywana i aktualizuje również listę wyboru ścian; nie resetuje zaznaczonego obrazu. E2E dwukliku, anulowania, zapisu, odświeżenia i zachowania zaznaczenia: `exhibition.test.cjs`, `workspace-ui.test.cjs`.

# Kwadratowe przyciski ikonowe

Przyciski nawigacji i listy na dolnym pasku mają stałe wymiary 32 × 32 px oraz wyśrodkowane ikony, niezależnie od wysokości paska. Kompaktowe przyciski historii w nagłówku mają 24 × 24 px. Test geometrii przycisków dolnego paska przy szerokim i wąskim oknie: `exhibition.test.cjs`.

# Nazwy ścian tylko w widokach ekspozycji

Dolny pasek nazw ścian, strzałek i listy jest widoczny wyłącznie w „Ścianach ekspozycji” i „Układzie ekspozycji”. W „Szkic 2D” oraz „Model 3D” jest ukryty i nie rezerwuje miejsca dla kontrolek. Przejścia przez wszystkie cztery widoki z zachowaniem układu: `workspace-ui.test.cjs`.


## Uzupełnienia po audycie testów

| Chronione zachowanie | Aktywne zestawy |
|---|---|
| Import siedmiu przykładów nazw, dat historycznych i DPI do formularza, poprawne wymiary oraz oznaczenia źródła | `parser-browser.cjs` |
| Podpowiedzi autorów myszą i klawiaturą oraz zapis po przeładowaniu | `authors.cjs` |
| Wklejanie jednego i wielu obrazów bez przejmowania zwykłego tekstu w polach | `clipboard.cjs` |
| Rozpoznawanie techniki i podłoża, ręczne przypisania, ochrona poprawek, oznaczenia źródła i wąski widok | `metadata.cjs` |
| Obrót, korekta perspektywy, proporcje, anulowanie oraz lokalna i globalna historia zdjęcia | `photo-editor.cjs` |
| Quota i abort zapisu obrazów oraz planu: komunikat, brak nadpisania ostatniego stanu, odzyskanie zmian i reload | `storage-failures.test.cjs` |
| Zmiana wersji i niedostępność IndexedDB; nieczytelny rekord bez nadpisania danych | `storage-failures.test.cjs` |
| Statyczne hostowanie z podkatalogu, względne zasoby, rysowanie, zapis i reload; blokada wszystkich innych originów | `static-hosting.test.cjs` |
| Zmiana manifestów lub fixture unieważnia cache; raport zawiera wersje Node, Playwright i przeglądarki | `cad-runner.test.cjs` |
| Dokładnie 117 pomiarów, rozłączne partycje i odrzucanie raportu z brakującym przypadkiem | `case-manifest.test.cjs`, `case-manifest.cjs`, `cad-execution.cjs` |

Wszystkie wymienione zestawy należą do `node tests/cad-suite.cjs --all`. Pięć proceduralnych scenariuszy biblioteki jest jawnie zarejestrowanych w runnerze i inventory; nowe pliki `.test.cjs` są wykrywane automatycznie. Testy nie wymagają screenshotów. Dane i sesje są izolowane od profilu użytkownika.

## Import / eksport plików


Zaznaczenie kafelków: `transfer.test.cjs` sprawdza kwadratowy podgląd rzutu (DOM i bitmapa 640 × 640), niewidoczne pole wyboru, zielone tło całego kafelka wraz z podglądem, odznaczanie klawiaturą oraz oba motywy.

Okno importu i eksportu: `transfer.test.cjs` sprawdza ikonę po prawej stronie, rozmiar modalu względem viewportu, dwie zakładki z obsługą klawiatury, duże kafelki bez domyślnego zaznaczenia, ręczny wybór rzutów i obrazów, zachowanie wyboru między zakładkami oraz eksport wyłącznie wskazanych danych. Miniatury rzutów są bitmapami o stałym rozmiarze, generowanymi poza DOM; test zlicza polecenia rysowania i potwierdza brak kolejnego renderowania podczas rzeczywistego przewijania i przełączania zakładek. Jednostkowo sprawdzane są krzywe, zakres podglądu, obrót podkładu i brak zmian danych; E2E sprawdza też szerokość treści na małym ekranie.

`transfer.test.cjs`: wybór jednego lub wielu rzutów; dodawanie rzutów bez nadpisywania z nowymi ID projektu i zachowaną geometrią; kolekcja ze zdjęciami i stanem formularza; pełny projekt z ostrzeżeniem, anulowaniem i zastąpieniem; reload; błędny format i typ pliku; pusta selekcja; jednostkowa walidacja i remapowanie powiązań; podkład w pliku i jego odtworzenie; kontrolowany abort zapisu, zachowanie pracy w sesji, atomowy zapis i ponowienie.

## Drzewko projektu i wirtualne kolekcje



Zmiana szerokości panelu: `project-tree-resize.test.cjs` sprawdza rzeczywiste przeciąganie prawej krawędzi, rozsuwanie biblioteki, ograniczenia szerokości, zapamiętanie po reload, sterowanie klawiaturą i anulowanie przeciągania przez Escape. Sprawdza też działanie na małym ekranie oraz w widoku rzutu bez zmiany geometrii i położenia obszaru rysowania. Testy jednostkowe obejmują limity, zaokrąglanie i błędne wartości. Zestaw jest zarejestrowany w inventory i wykrywany przez główny runner.

Miniatury jako ikony prac: `image-icons.test.cjs` sprawdza jednostkowo centralne kadrowanie pionowych, poziomych, kwadratowych i skrajnie wydłużonych grafik oraz odrzucenie błędnych wymiarów. E2E przez rzeczywisty import obrazów sprawdza polecenia rysowania (100 × 300 → kadr 100 × 100 od Y=100; analogicznie dla 300 × 100), bitmapę 48 × 48 i ikonę DOM 18 × 18. Licznik operacji potwierdza generowanie przy wczytaniu także zwiniętej gałęzi, brak ponownego generowania przy przewijaniu i przebudowie drzewka, aktualizację po obrocie i edycji zdjęcia, ponowne użycie wersji przy cofaniu/ponawianiu oraz poprawne odtworzenie po reload. `collections.test.cjs` został zaktualizowany: przy pracach wymaga prawdziwych miniatur zamiast ikon dokumentu, zachowując sprawdzanie wcięć i przeciągania. Oba pliki są aktywne w runnerze i inventory.

Wyrównanie wierszy bez strzałki i ze strzałką: `collections.test.cjs` porównuje dokładne współrzędne X ikon i etykiet dla „Wszystkie”, „Bez folderu” i kolekcji użytkownika (tolerancja 0,5 px), a także środkowanie ikon w pionie. Sprawdza oba motywy i szerokości 1500 oraz 390 px.

Wygląd eksploratora z przykładu: `collections.test.cjs` sprawdza ikony folderów w korzeniach i kolekcjach, ikony dokumentów przy pracach, wcięcia kolejnych poziomów, równe wiersze 30–36 px, zwykłą grubość pisma i brak pionowych linii. Test rozwija i zwija gałąź klawiaturą, sprawdza obrót strzałki oraz rzeczywiste przeciąganie po zmianie wyglądu. Dotychczasowe testy kolekcji pozostają aktywne.

`collections.test.cjs` (aktywny w inventory i automatycznie wykrywany przez runner): nazwy i zakres kolekcji; tworzenie, zmiana nazwy, odrzucenie duplikatów, usunięcie samego folderu i cofnięcie; rzeczywiste przeciąganie podglądów i pozycji drzewka między folderami oraz do „Bez folderu”; alternatywny wybór folderu przy obrazie; filtrowanie biblioteki i zakładek akceptacji; nowe obrazy w wybranym folderze; zachowanie opisów zaakceptowanych prac; zapis i reload; kolekcje w eksporcie obrazów i całego projektu (w tym puste foldery); import dodający nowe grupy z osobnymi ID i nazwami oraz obsługa dawnych plików bez kolekcji; dostęp z widoku rzutu bez zmiany geometrii. Kontrolowane quota i abort sprawdzają komunikat o pracy tylko w sesji, brak częściowego zapisu przypisania, ponowienie i reload.

Cofanie utworzenia folderu po akceptacji obrazu również przenosi prace do „Bez folderu”; ponowienie odtwarza przypisania (`collections.test.cjs`).

Na małym ekranie drzewko startuje zamknięte i zamyka się po zmniejszeniu okna; przycisk nagłówka pozwala je otworzyć i zamknąć. `collections.test.cjs` sprawdza dostępność kontrolek obrazu, a `photo-editor.cjs` zachowuje pełną regresję edycji zdjęcia na telefonie.

## Licencja repozytorium

Licencja repozytorium: `repository-layout.test.cjs` sprawdza obecność zastrzeżenia praw właściciela, wymogu uprzedniej pisemnej zgody na użycie i modyfikacje, ograniczeń kopiowania i dystrybucji, zakresu komercyjnego i niekomercyjnego, zachowanie licencji podmiotów trzecich i warunków GitHub oraz odnośnik z README. Licencja fontu Manrope pozostaje zachowana.
