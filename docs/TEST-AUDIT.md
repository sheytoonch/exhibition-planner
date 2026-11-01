# Audyt testów Exhibition Planner

Data: 28.10.2026. Zakres: architektura testów, pokrycie funkcji, dokumentacja Markdown i `docs`. Kontynuacja [checkpointu](TEST-AUDIT-CHECKPOINT.md).

## Ocena

Projekt ma mocne testy geometrii CAD, wymiarowania, manipulacji i renderowania GPU. Najważniejsza luka organizacyjna to rozjazd między dokumentowanymi scenariuszami biblioteki obrazów a zakresem oficjalnego `--all`. Druga to brak trwałych regresji awarii IndexedDB. Nie znalazłem dowodu, że obecny podział na partycje gubi przypadki.

Nie zmieniano aplikacji, testów ani konfiguracji. Dodano wyłącznie dokumentację audytu. Nie uruchamiano nowej pełnej regresji, benchmarków ani screenshotów.

## Co rzeczywiście sprawdzono

### Zapisany pełny wynik

Ponowne `node tests/cad-suite.cjs --check` potwierdziło zgodność aktualnych źródeł z `tests/test-runs/run-eyffUz/summary.json`.

To **zapisany wynik**, nie nowy przebieg: 338 przypadków, 89 jednostkowych i 249 zaklasyfikowanych jako E2E, 48 zestawów / 51 zadań. Cztery workery: 70,626 / 70,533 / 70,535 / 70,583 s, suma pracy 282,277 s. CPU całego komputera średnio 59,66%, szczyt 91,10%; 20 dostępnych procesorów logicznych; ekwiwalent CPU 11,93 / 18,22. Raport powstał 27 października 2026 około 22:14–22:16 czasu Warszawy.

`--check` nie potwierdza wersji środowiska przeglądarki ani wszystkich danych wejściowych. Ograniczenie jest opisane w instrukcjach projektu.

### Nowe próby celowane

Wszystkie próby przeglądarkowe korzystały z lokalnego Edge, wymuszonego offline i świeżych kontekstów, bez danych użytkownika.

| Sprawdzenie | Faktyczny wynik |
|---|---|
| `parser-browser.cjs` z preloadem `offline-tests.cjs` | Kod wyjścia 0; siedem przykładów importu, pola wymiarów i dat oraz oznaczenia źródła |
| `authors.cjs` z tym samym preloadem | Kod wyjścia 0; podpowiedzi, wybór myszą/klawiaturą i odtworzenie autorów |
| `clipboard.cjs` z tym samym preloadem | Kod wyjścia 0; kontrolowane zdarzenia wklejania, bez odczytu schowka systemowego |
| `metadata.cjs` z tym samym preloadem | Kod wyjścia 1: blokada `page.screenshot` w linii 90. Nie jest to zaliczony scenariusz |
| Wstrzyknięty `QuotaExceededError` przy zapisie obrazów | Komunikat o zapisie tylko w sesji; ponowienie po wyłączeniu awarii i odtworzenie po reload poprawne |
| Przerwanie transakcji obrazów przez `abort()` | Analogiczny poprawny komunikat, ponowienie i reload |
| Rejestracja pomiarów bez partycji kontra cztery partycje | 117 przypadków; partycje 30/29/29/29; 117 unikalnych nazw, dokładnie ta sama suma |
| Te same 117 nazw kontra ostatni pełny raport | Zgodność pełna |

Próby quota/abort wykonano jako jednorazowe interakcje audytowe z instrumentacją IndexedDB. Nie są zapisanymi testami regresji. Nie mierzono dla tych prób CPU ani czasów workerów; nie są nowym zbiorczym wynikiem runnera.

## Priorytet 1: uzupełnić oficjalny zakres biblioteki obrazów

### Potwierdzone ustalenie

`cad-suite.cjs` automatycznie wykrywa `*.test.cjs`; skrypty proceduralne wymagają jawnej rejestracji. `parser-browser.cjs`, `authors.cjs`, `clipboard.cjs`, `metadata.cjs` i `photo-editor.cjs` nie są zarejestrowane i nie są importowane przez aktywne zestawy.

Nie jest to samo w sobie błąd runnera: starsze scenariusze są świadomie traktowane oddzielnie. Problemem jest brak jawnej informacji, które chronione zachowania zostały zastąpione aktywnymi regresjami, a które pozostają poza nimi.

### Konkretna luka parsera

`tests/PARSER.md` opisuje browserowy import przykładów. W aktywnym `parser.cjs` są silne sprawdzenia logiki dat i wymiarów, także większości tych samych nazw. Nie zastępują one jednak sprawdzenia automatycznego wypełnienia formularza, `aria-invalid` oraz `.source-mark` po rzeczywistym imporcie wielu plików.

Aktywne `save-image.cjs`, `storage.cjs`, `workspace-ui.test.cjs` i `exhibition.test.cjs` importują proste pliki i sprawdzają inne ścieżki. Nie znaleziono tam równoważnego zestawu siedmiu przykładów z datami historycznymi, niepewnością, DPI i oznaczeniami źródła.

### Inne scenariusze biblioteki

Podpowiedzi autorów i kontrolowany paste obrazów mają działające osobne testy, ale nie znalazłem ich odpowiedników w aktywnym zestawie. `save-image.cjs` sprawdza m.in. obrót i cofanie; nie należy zatem twierdzić, że cała obróbka zdjęć jest nieprzetestowana. Pełny edytor korekty perspektywy, proporcji i jego historii ma osobny niezarejestrowany `photo-editor.cjs`.

`metadata.cjs:90` i `photo-editor.cjs:57` zawierają wywołania screenshotów. Pierwsze zostało faktycznie zatrzymane przez guard offline; drugiego skryptu nie uruchamiano. Nie wolno włączać tych plików hurtowo, ignorując aktualne zasady.

### Zalecana zmiana

1. Zachować siedem przykładów parsera i przenieść je do aktywnej regresji przeglądarkowej.
2. Włączyć aktualne scenariusze autorów i paste z poprawną klasyfikacją.
3. Dostosować metadane i edytor zdjęć do obecnych zasad bez screenshotów, zachowując asercje funkcjonalne.
4. W `REQUIREMENTS-TESTS.md` zaznaczyć aktywne pokrycie i dokumenty historyczne. Starsze CAD-y porównać z nowymi przed ewentualnym usunięciem albo rejestracją; wiele z nich może być już zastąpionych.

## Priorytet 1: utrwalić regresje awarii zapisu

Kod obsługuje abort i wyjątki zapisu (`app.js:3264–3281`, `4521–4529`) oraz blokadę/zmianę wersji IndexedDB (`3288–3304`). Zarejestrowany `storage.cjs` skupia się na poprawnym zapisie, reload i ponownym uruchomieniu przeglądarki.

Dwie próby awarii w audycie potwierdziły poprawne zachowanie zapisu **obrazów**, więc nie ma podstaw do zgłoszenia stwierdzonej utraty danych ani fałszywego sukcesu w tych scenariuszach. Przycisk zapisu korzysta z wyniku `persistImages()` i odróżnia zapis trwały od sesyjnego (`app.js:4462–4463`).

Brakuje stałych testów tych zachowań. Nie wykonano analogicznego wstrzyknięcia awarii planu, próby `onblocked`, `versionchange`, uszkodzonego rekordu ani konkurujących edycji w dwóch kartach.

Zalecany minimalny zestaw:

- quota i abort osobno dla obrazów i planu;
- prawdziwy komunikat i zachowanie bieżącej pracy;
- ponowienie i reload ostatniego poprawnego zapisu;
- blokada i zmiana wersji bazy;
- kontrolowany uszkodzony rekord oraz przewidywalna reakcja zamiast ogólnego uznania bazy za niedostępną.

To priorytet ochrony danych, nie potwierdzony defekt każdej wymienionej ścieżki.

## Priorytet 2: wzmocnić wiarygodność raportowania

### Fingerprint zależności

`cad-suite.cjs:8` nie uwzględnia `tests/package.json` ani `tests/package-lock.json`. Zmiana zależności testowych może pozostawić zgodny `--check`. Zasady już ostrzegają o zmianie środowiska; mimo to oba manifesty powinny należeć do fingerprintu. Raport powinien też zapisywać wersje Node, Playwright i Edge, żeby dało się ocenić porównywalność.

### Kompletność przypadków

`validateCases` kontroluje raportowane statusy i zgodność z licznikiem tego samego raportu. Końcowe `complete` sprawdza zadania i unikalność ID. Nie ma niezależnej listy wszystkich oczekiwanych przypadków. `queued` jest zbierane, lecz nie jest używane do walidacji.

Syntetyczny raport jednego poprawnego przypadku z `queued=99` jest akceptowany. To ograniczenie gwarancji, a nie dowód utraty przypadków w obecnym przebiegu. **Obecne 117 przypadków podzielonych na cztery partycje jest kompletne**, co potwierdzono niezależną rejestracją nazw w VM bez wykonywania ciał testów ani zmiany kodu.

Zalecenie: dodać stałe sprawdzenie, że wykaz bez partycji jest dokładnie równy rozłącznej unii partycji, oraz zweryfikować scenariusz warunkowego niezarejestrowania obowiązkowego przypadku. Nie wystarczy bez analizy zrównać `queued` z liczbą wyników: zdarzenia Node mogą obejmować kontenery i suite.

### Znaczenie kategorii E2E

`cad-reporter.cjs:7` klasyfikuje `Browser:` jako E2E. Część `gpu-browser.test.cjs` tworzy własny canvas, siatkę i renderer bez pełnej ścieżki użytkownika. To wartościowe testy integracyjne w przeglądarce; nie należy odczytywać liczby 249 jako tylu pełnych scenariuszy użytkownika.

Wystarczy uczciwy opis kategorii, ewentualnie osobna kategoria browser integration. Nie usuwać testów GPU i nie obniżać ich znaczenia tylko dlatego, że są inaczej sklasyfikowane.

## Priorytet 2: uzupełnić sprawdzenie sposobu hostowania

Pomocniki otwierają `file://` w Edge z bezwzględnej ścieżki Windows. Tę deklarowaną ścieżkę uruchomienia pokrycie dobrze reprezentuje. Nie znaleziono aktywnego testu nawigacji do aplikacji przez HTTP, choć README deklaruje także statyczny hosting/GitHub Pages.

Zalecenie: mały test przez lokalny serwer statyczny z aplikacją w podkatalogu, względnymi zasobami, zapisem i reload. Bez kontaktu z GitHub ani zewnętrzną siecią. Potrzebuje osobnego rozróżnienia dopuszczonego loopbacku i blokowanej sieci w helperze offline.

Firefox/WebKit to opcjonalne rozszerzenie po ustaleniu wspieranych przeglądarek. Nie stwierdzono w audycie, że obecna aplikacja na nich nie działa.

## Priorytet 3: uporządkować dokumentację

Przejrzano wcześniejszą inwentaryzację 26 plików Markdown oraz zawartość `docs`; checkpoint audytu i ten raport powstały później. Historycznych checkpointów nie należy interpretować jako bieżącej listy defektów. Szczególnie stary opis programowego renderera został zastąpiony wdrożeniem WebGL.

Konkretne poprawki:

| Dokument | Problem |
|---|---|
| `docs/ADAPTIVE-TESTING-CHECKPOINT.md` | Stare zdanie o domyślnym `--check` dla auto, mimo aktualnego domyślnego 4 |
| `tests/CAD-BASELINE.md` | Odwołanie do narzędzi testowych w `v1` |
| `tests/REQUIREMENTS-TESTS.md` | Fragment o aplikacji w katalogu `aplikacji` zamiast w katalogu głównym |
| `tests/USER-REGRESSIONS.md` | Stary plik wyników `cad-latest-results.txt` |
| `tests/WORKER-SCALING-RESULTS.md` | Zniszczone polskie znaki, obecne w samym pliku odczytanym jako UTF-8 |
| `docs/ADAPTIVE-VALIDATION.json` | Bezwzględne lokalne ścieżki |
| `tests/PARSER.md` | Opis browserowego testu bez wyjaśnienia, że nie należy do `--all` |

Siedem lokalnych linków Markdown prowadzi do brakujących artefaktów: pięć w `TEST-BOTTLENECKS.md:71–74` i dwa w `WORKER-SCALING-RESULTS.md:43`. To ignorowane materiały historyczne; ich brak nie obala pomiarów, ale uniemożliwia bezpośrednie sprawdzenie źródeł w tym checkoutcie.

Proponowany porządek: jeden aktualny dokument uruchamiania i zakresu, bieżąca mapa wymagań oraz osobno oznaczone archiwum checkpointów. Nie usuwać niewygodnych historycznych wyników ani nie zastępować ich niezmierzonymi liczbami.

## Mocne strony, które należy zachować

- Rzeczywiste rysowanie i pomiary w przeglądarce oraz weryfikacja modelu i zapisu.
- Rozdzielenie analitycznej geometrii i siatki renderowania.
- Testy otworów, triangulacji, zasłaniania, WebGL i zasobów GPU.
- Wymuszanie offline, izolacja kontekstów i raporty błędów procesu.
- Odrzucanie raportowanych skip/TODO/anulowania i duplikatów.
- Pomiar czasu pracy workerów oddzielony od CPU całego komputera.
- Cztery workery jako stabilny domyślny wariant; audyt nie uzasadnia zmiany tej liczby ani kolejnej serii benchmarków.

## Proponowana kolejność dalszych prac

1. Aktywne regresje biblioteki: parser-browser, autorzy, paste, następnie migracja testów metadanych i edytora zdjęć.
2. Stałe negatywne testy IndexedDB, zaczynając od dwóch zachowań potwierdzonych w audycie.
3. Fingerprint manifestów i kontrola rozłączności/kompletności partycji.
4. Test statycznego hostowania w podkatalogu i uporządkowanie dokumentacji.

Przy implementacji najpierw dotknięte zestawy, następnie jedna pełna regresja końcowej wersji. Zmiana planowania wymaga dodatkowo porównania 1/4 workerów zgodnie z `AGENTS.md`; samo rozszerzenie fingerprintu nie jest zmianą planowania.

Audyt jest zakończony na poziomie wniosków i celowanych weryfikacji. Nie jest pomiarem pokrycia linii/gałęzi, pełnym audytem dostępności ani dowodem braku innych błędów. Rekomendacje powyżej nie zostały przedstawione jako wdrożone poprawki.

## Aktualizacja po wdrożeniu ulepszeń

Ulepszenia wynikające z audytu oraz końcową walidację opisano w [TEST-IMPROVEMENTS.md](TEST-IMPROVEMENTS.md). Pełny zestaw obejmuje teraz 357 przypadków (95 jednostkowych i 262 E2E); przebiegi na 1 i 4 workerach dały identyczne przypadki i wyniki. Powyższe obserwacje pozostają historycznym opisem stanu audytowanego przed zmianami.
