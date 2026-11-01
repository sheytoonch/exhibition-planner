# Zasady pracy nad aplikacją

- To jedyna rozwijana wersja aplikacji.
- Najpierw realizuj kolejne konkretne polecenia użytkownika. Pozostałe funkcje dopełnimy później.
- Właściwy projekt to wyłącznie `index.html`, `app.js` i `style.css` w tym katalogu. Testy i notatki są materiałami pomocniczymi.
- Bez backendu, frameworków, npm, procesu kompilacji, CDN i zewnętrznych zasobów potrzebnych do uruchomienia aplikacji.
- `index.html` ma działać po bezpośrednim otwarciu jako plik, a także na darmowym GitHub Pages. Stosuj względne ścieżki, zwykłe skrypty i unikaj odczytu lokalnych plików przez fetch.
- Nie publikuj aplikacji w OpenAI Sites i nie otwieraj jej przez OpenAI.
- Zachowuj prosty interfejs. Nie dodawaj niezamówionych paneli, narzędzi ani demonstracyjnych projektów.
- Ten plik nie jest częścią aplikacji i nie jest potrzebny do hostowania.

## Testowanie zgłoszeń użytkownika

- Każdy zgłoszony problem i każde żądanie zmiany zamień w test akceptacyjny lub regresyjny. Dla interakcji z aplikacją pisz test end-to-end wykonujący rzeczywiste działania użytkownika w przeglądarce; logikę sprawdzaj także testami jednostkowymi.
- Przy naprawie błędu najpierw odtwórz go testem i sprawdź, że test wykrywa problem, a następnie wprowadź poprawkę. Nie zastępuj interakcji E2E bezpośrednimi wywołaniami solvera ani manipulowaniem stanem aplikacji.
- Aktualizuj dotychczasowe testy po świadomej zmianie zachowania interfejsu. Zachowuj sprawdzanie chronionych zachowań; nie wyłączaj testów ani nie osłabiaj asercji tylko po to, żeby uzyskać zielony wynik.
- Dodawaj nowe testy do odpowiedniego zestawu uruchomieniowego w `tests`. Testy pozostają materiałami pomocniczymi i nie mogą być zależnością aplikacji.
- Po zakończeniu zmian uruchamiaj testy jednostkowe i E2E. Naprawiaj wykryte problemy i ponawiaj testy aż zestaw przejdzie. Nie przedstawiaj wyników wybranego podzbioru jako wyniku całego zestawu.
- Jeśli środowisko uniemożliwia wykonanie testów, podaj konkretną przeszkodę i zakres niewykonanych sprawdzeń. Raportuj wyłącznie faktycznie uzyskane wyniki.

## Oszczędne uruchamianie testów

- Metoda diagnozowania bottlenecków, uczciwego porównywania wariantów i zachowania zakresu testów: [tests/TEST-PERFORMANCE-METHODOLOGY.md](tests/TEST-PERFORMANCE-METHODOLOGY.md). Przeczytaj ją przed optymalizacją testów lub planowania ich wykonania; historyczne liczby nie zastępują pomiaru bieżącej wersji.
- Podczas implementacji uruchamiaj odpowiednie zestawy przez `node tests/cad-suite.cjs exhibition` (można podać kilka nazw). Nazwy sprawdzisz przez `--list`.
- Po zakończeniu zmian uruchom pełną regresję jeden raz: `node tests/cad-suite.cjs --all`. Po błędzie najpierw popraw i sprawdź dotknięte zestawy, potem wykonaj pełną regresję końcowej wersji.
- Skrypt zapisuje pełne logi i raport JSON w `tests/test-runs`. Odczytuj krótkie podsumowanie; szczegółowy log tylko przy błędzie. Nie wczytuj całych logów udanych testów.
- `node tests/cad-suite.cjs --check` sprawdza, czy ostatni pełny sukces odpowiada aktualnym skrótom kodu aplikacji, testów i skryptów pomocniczych. Nie uruchamia testów. Sprawdzenie wybranego zestawu: `--check exhibition`.
- Zgodny zapisany wynik pozwala uniknąć przypadkowego powtarzania identycznej regresji. Nie przedstawiaj go jako nowego uruchomienia. Skróty nie obejmują środowiska przeglądarki ani wszystkich danych wejściowych; po zmianie środowiska lub danych wykonaj nowe testy.
- Zmiana kodu podczas przebiegu daje status `changed`, nie potwierdzenie aktualnej wersji. Raport z podzbiorem, błędem, timeoutem lub statusem `running` nie potwierdza pełnej regresji.
- Nie używaj zrzutów ekranu ani AI do oceny testów. Wygląd i zachowanie sprawdzaj przez wartości DOM/SVG, pozycje, rozmiary, polecenia rysowania oraz dane GPU. Testy przeglądarkowe działają offline.
- Domyślny przebieg ma stałe 4 workery: `node tests/cad-suite.cjs --all`. Tryb adaptacyjny jest opcjonalny przez `--workers auto`; nie wybieraj go bez wyraźnej potrzeby. `--workers 1` wykonuje przebieg sekwencyjny. Pomiary CPU/RAM i raport dostępnych procesorów logicznych działają także przy stałych 4 workerach. `--compare raport1.json raport4.json` wymaga identycznych przypadków, wyników i wersji kodu.
- Historia `tests/test-timings.json` zawiera 5 ostatnich poprawnych czasów każdego zadania osobno dla liczby workerów. Nowe zadania ruszają wcześnie, pozostałe według malejącej średniej. Plik ma blokadę zapisu; awarie i timeouty nie uczą historii.
- Wszystkie pliki `*.test.cjs` są wykrywane automatycznie; typ i ewentualne blokady zasobów deklaruj w `tests/test-inventory.json`. Starsze skrypty są osobnymi scenariuszami i muszą faktycznie wykonać asercje.
- Każdy wymóg i błąd ma mieć test; aktualizuj `tests/REQUIREMENTS-TESTS.md`. Pominięcie, brak przypadku, awaria workera, powtórzony wynik lub niekompletny raport oznaczają nieudane sprawdzenie. Nie stosuj automatycznego ponawiania ukrywającego pierwszy błąd.
- Podział najwolniejszego pliku na partycje nie może zmieniać zbioru przypadków. Po zmianie planowania porównaj pełne przebiegi 1 i 4 workerów.
- Raport dla użytkownika: liczba przypadków jednostkowych/E2E, liczba użytych workerów, ich czasy i suma, średnie/szczytowe użycie CPU całego komputera oraz dostępna liczba procesorów logicznych podczas przebiegu. Obciążenie w przeliczeniu na wątki opisuj jako ekwiwalent CPU (średnia/szczyt), nie liczbę rzeczywistych wątków testów. Zmianę dostępności pokazuj zakresem; brak pomiaru jawnie, bez wymyślania wartości. Bez osobnych kategorii regresji, linii PASS, czasu przebiegu i list błędów. Błędy analizuj sam; nierozwiązany problem zgłoś oddzielnie.
- Zakończony poprawnie przebieg nie wymaga ponawiania bez nowej zmiany albo konkretnej wątpliwości.

## Wnioski z audytu testów

Szczegóły i dowody: [docs/TEST-AUDIT.md](docs/TEST-AUDIT.md). To opis stanu z dnia audytu, nie lista już wdrożonych poprawek ani polecenie przebudowy aplikacji.

- **Test w katalogu nie oznacza aktywnej regresji.** Dla chronionego wymagania sprawdź konkretny przypadek i jego obecność w `--list`, inventory oraz raporcie. Proceduralne pliki `.cjs` wymagają jawnej rejestracji; automatyczne wykrywanie dotyczy `*.test.cjs`. Nie rejestruj hurtowo historycznych skryptów: najpierw ustal, czy zostały zastąpione i czy spełniają obecne zasady.
- **Import sprawdzaj także przez formularz.** Test parsera nie zastępuje importu pliku i sprawdzenia automatycznych wartości, oznaczeń źródła, niepewnych dat oraz ochrony ręcznych poprawek. Zmieniając bibliotekę, zachowuj odpowiednie regresje autorów, wklejania obrazów i edytora zdjęć, z zapisem i odtworzeniem tam, gdzie dotyczą trwałych danych.
- **Zapis testuj również po awarii.** Przy zmianach IndexedDB uwzględnij kontrolowane quota/abort, prawdziwy komunikat o zapisie tylko w sesji, zachowanie bieżącej pracy, ponowienie i reload. Zmiany otwierania lub migracji bazy sprawdzaj także przy blokadzie i zmianie wersji. Używaj wyłącznie świeżych kontekstów i danych testowych, nigdy bazy użytkownika.
- **Nie rozszerzaj gwarancji `--check`.** Fingerprint obejmuje kod, manifesty `tests/package.json` i `tests/package-lock.json` oraz pliki `tests/fixtures`. Raport zapisuje wersje Node, Playwright i uruchomionej przeglądarki. Zmiana środowiska nadal wymaga nowego sprawdzenia; sam zgodny skrót nie potwierdza niezmienności przeglądarki ani wszystkich zewnętrznych danych.
- **Kompletność zadań nie dowodzi kompletności przypadków.** Przy zmianie warunkowej rejestracji lub partycji porównaj wykaz bez partycji z rozłączną unią wszystkich partycji. Każdy przypadek ma wystąpić dokładnie raz; identyczna liczba nie wystarcza. Nie uznawaj obecnej kompletności za dowód, że runner wykryje każdą przyszłą utratę przypadku.
- **Nazywaj zakres sprawdzenia zgodnie z rzeczywistością.** Bezpośredni test renderera GPU w przeglądarce jest testem integracyjnym komponentu, nawet gdy runner zalicza go do kategorii E2E. Nie przedstawiaj wszystkich takich przypadków jako pełnych ścieżek użytkownika ani liczby testów jako procentowego pokrycia kodu. Zablokowany przez guard skrypt nie jest zaliczonym scenariuszem.
- **Rozróżniaj uruchomienie jako plik i hosting statyczny.** Udane testy `file://` nie potwierdzają osobno działania przez HTTP. Przy zmianach ładowania zasobów lub hostowania sprawdzaj względne ścieżki także w podkatalogu lokalnego serwera statycznego. Ewentualny wyjątek offline ma dopuszczać tylko potrzebny loopback, nie otwierać dostępu do internetu.
- **Dokumentacja ma wskazywać aktualne reguły.** Przy zmianie komendy, struktury repozytorium lub zakresu testów popraw powiązane instrukcje i mapę wymagań. Historyczne checkpointy zachowuj z datą i statusem. Preferuj względne odnośniki; brakujące, ignorowane artefakty pomiarowe oznaczaj jako niedostępne, zamiast sugerować, że czytelnik może je odtworzyć z samego linku.
