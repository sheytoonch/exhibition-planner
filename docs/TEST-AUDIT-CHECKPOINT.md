# Audyt testów — checkpoint do kontynuacji

Data: 28.10.2026. Projekt: `C:\Users\przemek\Documents\GitHub\exhibition-planner`.

## Polecenie i stan pracy

Użytkownik poprosił o analizę aplikacji pod kątem testów, wszystkich plików Markdown oraz katalogu `docs`. Następnie poprosił o przerwanie analizy i zapis obserwacji do pliku, żeby kontynuować następnym razem.

Nie zmieniano kodu aplikacji, testów ani konfiguracji. Nie uruchamiano nowej pełnej regresji. Wykonywano odczyty, analizę statyczną i pojedynczą syntetyczną próbę walidatora raportów w pamięci. Ten plik jest jedyną zmianą tego zadania.

## Instrukcje obowiązujące przy wznowieniu

Przeczytać `AGENTS.md`, `tests/AGENTS.md` oraz `tests/TEST-PERFORMANCE-METHODOLOGY.md`.

- Aplikacja ma pozostać trzema plikami: `index.html`, `app.js`, `style.css`. Bez frameworka, backendu, procesu kompilacji ani zależności potrzebnych do jej uruchomienia.
- Ma działać zarówno po otwarciu pliku, jak i na GitHub Pages.
- Nie korzystać z OpenAI Sites.
- Nie używać screenshotów ani AI do oceny testów. Interfejs sprawdzać liczbowo przez DOM/SVG, rysowanie i dane GPU.
- Testy mają działać offline, z izolacją danych. Nie zastępować właściwych interakcji E2E manipulowaniem modelem.
- Każda naprawa wymaga regresji, aktualizacji `tests/REQUIREMENTS-TESTS.md` i właściwych sprawdzeń. Nie osłabiać asercji.
- Domyślnie 4 workery. Nie uruchamiać benchmarków 1/4/auto bez konkretnego uzasadnienia.
- Zgodny zapisany wynik pozwala uniknąć ponownego identycznego uruchomienia; nie przedstawiać go jako nowego przebiegu.

## Zakres dotychczasowego przeglądu

Inwentaryzacja wykazała **26 plików Markdown** poza `node_modules`, `.git` i `test-runs`. W `docs` jest 11 plików: dokumenty Markdown, `ADAPTIVE-VALIDATION.json` oraz skrypt i wyniki w `ux-ui-audit`.

Przegląd obejmował instrukcje, README, dokumenty wymagań i regresji, metodologię oraz checkpointy testowania i skalowania, dokumentację CAD/3D, parsera, przebudowy UI i wydajności przeciągania. Obejrzano także skrypt i dane audytu UI oraz wskaźniki walidacji adaptacyjnej. Część dużych odczytów była obcinana przez limit wyjścia narzędzia i uzupełniana mniejszymi fragmentami. Przy końcowym raporcie warto ponownie przeczytać dokument związany z każdym konkretnym zarzutem; nie utożsamiać przejrzenia dokumentacji z weryfikacją wszystkich historycznych twierdzeń.

Kod analizowany szczegółowo: `tests/cad-suite.cjs`, `cad-execution.cjs`, `test-scheduler.cjs`, `cad-reporter.cjs`, `assertion-counter.cjs`, `offline-tests.cjs`, `cad-test-helpers.cjs`, manifest i inventory. Obejrzano reprezentatywne testy geometrii, GPU, UI, parsera, zapisu i schedulera oraz ścieżki IndexedDB w `app.js`. Nie jest to jeszcze przegląd każdej linii wszystkich testów i całego `app.js`.

Rozmiary: `app.js` 4686 linii, `style.css` 1780, `index.html` 235.

## Potwierdzony zapisany wynik — bez nowego uruchomienia

Polecenie `node tests/cad-suite.cjs --check` zwróciło zgodność bieżącego fingerprintu z zapisanym pełnym sukcesem.

- Wskaźnik: `tests/test-runs/latest-full.json`.
- Raport: `tests/test-runs/run-eyffUz/summary.json`.
- Status: `passed`, pełny zakres, 48 zestawów źródłowych i 51 zadań; najdłuższy plik jest dzielony na 4 partycje.
- Przypadki: **338**, w tym **89 unit** i **249 zaklasyfikowanych jako E2E**.
- Przebieg zapisany od `2026-10-27T21:14:51.426Z` do `2026-10-27T21:16:02.084Z`, czyli 27 października 22:14–22:16 w Warszawie.
- 4 workery: 70,626 / 70,533 / 70,535 / 70,583 s; suma pracy 282,277 s.
- CPU całego komputera: średnio 59,66%, szczyt 91,10%; dostępnych 20 procesorów logicznych.
- Ekwiwalent CPU: średnio 11,93, szczyt 18,22. To nie liczba rzeczywistych wątków testów.

Nie przedstawiać tych danych jako wyniku uruchomionego podczas tego audytu. `--check` nie potwierdza zgodności środowiska przeglądarki ani wszystkich wejść.

## Mocne strony

1. Duży zakres rzeczywistych interakcji CAD: rysowanie, wymiary, przeciąganie, undo/redo, migracja i odtworzenie po przeładowaniu.
2. Kontrola geometrii i danych zapisanych w IndexedDB, a nie wyłącznie obecności przycisków.
3. Oddzielenie analitycznej geometrii od siatki wyświetlania. Testy triangulacji, otworów, wybierania, zasłaniania, utraty WebGL i zasobów GPU.
4. Deterministyczne testy generowane geometrii, m.in. 60 konfiguracji z ziarnem w `geometry-properties.test.cjs`.
5. Izolowane konteksty przeglądarki, wspólne pomocniki i wymuszanie offline.
6. Runner odrzuca błędy procesu, timeouty, pominięte/TODO/anulowane i powtórzone raportowane przypadki; skrypty legacy muszą faktycznie wywołać asercje.
7. Kolejka workerów z historią czasów, blokadami, raportowaniem postępu i wykrywaniem zmian źródeł w trakcie przebiegu.
8. Metodologia odróżnia czas oczekiwania, sumę pracy i CPU, a dokumenty wydajności zaznaczają ograniczenia pomiarów. Nie wyciągać wniosku, że każda historyczna liczba opisuje obecną wersję.

## Ustalenia i ryzyka do dopracowania

### 1. Dokumentowany test importu parsera nie należy do pełnej regresji

`tests/PARSER.md` opisuje `parser-browser.cjs` jako test całego importu przykładów. Plik rzeczywiście importuje siedem nazw obrazów przez `setInputFiles` i sprawdza wynikowe pola wymiarów, daty i oznaczenia.

Jednocześnie nie ma go w liście `tests` w `cad-suite.cjs`, inventory ani w zależnościach zarejestrowanych zestawów. Automatyczne wykrywanie obejmuje tylko `*.test.cjs`. Zatem `--all` nie uruchamia tego konkretnego scenariusza.

Nie stwierdzono jeszcze, które z jego siedmiu przypadków są równoważnie pokryte przez inne aktywne testy. Nie nazywać wszystkich historycznych skryptów błędnie pominiętymi: dokumentacja świadomie rozróżnia zestaw regresji i starsze skrypty.

Następny krok: porównać przypadki z `parser.cjs`, `save-image.cjs`, `workspace-ui.test.cjs` i `exhibition.test.cjs`; dopiero potem wskazać rzeczywistą lukę i ewentualnie zarejestrować aktualny test.

### 2. Brakuje potwierdzonego pokrycia awarii trwałego zapisu

`storage.cjs` sprawdza udany zapis, reload, restart przeglądarki, miniaturę, pustą historię i trwałe usunięcie.

W aktywnych zestawach nie znaleziono wymuszania `QuotaExceededError`, przerwania transakcji, blokady otwarcia bazy ani `versionchange`. Wystąpienie słowa `onabort` w jednym teście dotyczy pomocniczego odczytu, nie wstrzyknięcia awarii.

Aplikacja ma takie gałęzie:

- `app.js:3275–3280`: zapis biblioteki i komunikaty przy abort/wyjątku.
- `app.js:3288–3304`: otwieranie, `onblocked`, `onversionchange` i odczyt bazy.
- `app.js:4521–4529`: zapis planu oraz błąd transakcji.

To potwierdzona luka w znalezionych testach, **nie potwierdzony błąd utraty danych**. Warto dodać kontrolowane awarie i sprawdzić komunikat, zachowanie bieżącej pracy, brak fałszywego sukcesu oraz możliwość ponownego zapisu i odtworzenia ostatniego trwałego stanu.

### 3. Liczba „E2E” obejmuje też testy integracyjne komponentów GPU

Inventory i reporter mają tylko kategorie `unit` i `e2e`. Prefiks `Browser:` automatycznie daje `e2e`.

Przykład: część `gpu-browser.test.cjs` w `page.evaluate` tworzy własny canvas, `PlanGpu` i `PlanMesh`, a potem odczytuje piksele. To wartościowy test komponentu w rzeczywistej przeglądarce, ale nie pełna ścieżka użytkownika przez aplikację. Inne testy w tym samym pliku rzeczywiście rysują i wyciągają obiekty przez UI.

Nie interpretować 249 jako 249 niezależnych pełnych workflow użytkownika. Zalecenie: rozróżnić unit / browser integration / E2E albo przynajmniej doprecyzować raportowanie i dokumentację.

### 4. Fingerprint nie uwzględnia manifestów zależności testowych

`fingerprint()` w `cad-suite.cjs` hashuje aplikację oraz pliki JS/CJS/MJS/HTML/CSS, `AGENTS.md` i `test-inventory.json`. Sprawdzono: **nie zawiera `tests/package.json` ani `tests/package-lock.json`**.

Zmiana wersji zależności testowych może zatem pozostawić zgodny `--check`. Zależności i środowisko nadal wymagają osobnej weryfikacji. Zasady już ostrzegają o ograniczeniach środowiskowych, ale warto hashować oba manifesty i zapisywać wersje Node, Playwright oraz Edge przy wyniku.

Nie zmieniano manifestów w celu próby; brak potwierdzono na liście plików fingerprintu.

### 5. Kompletność runnera nie jest manifestem wymaganych przypadków

`validateCases()` porównuje przypadki z licznikiem w tym samym raporcie i sprawdza ich statusy. Końcowe `summary.complete` porównuje zaplanowane i zakończone zadania oraz unikalność ID. Reporter zapisuje `queued`, lecz walidator go nie wykorzystuje.

Syntetyczna, niemutująca próba: raport z jednym poprawnym przypadkiem, `counts.tests=1`, zerami błędów/pominięć i `queued=99` został zaakceptowany przez `validateCases`.

Nie dowodzi to zgubienia przypadku w ostatnim rzeczywistym przebiegu. Pokazuje natomiast, że mechanizm nie zna oczekiwanej listy wszystkich obowiązkowych przypadków. Przy warunkowej rejestracji lub zmianie podziału na partycje może zabraknąć przypadku bez błędu statusu. Szczególnie istotny jest `cad-02-point-measurements.test.cjs`, który rejestruje przypadki warunkowo według indeksu partycji.

Dalsza weryfikacja: manifest oczekiwanych ID albo niezależne porównanie niepartycjonowanego wykazu z unią partycji. Licznik `queued` wymaga ostrożności, bo zdarzenia mogą dotyczyć także kontenerów/suit; nie proponować prostego równania bez analizy zdarzeń Node.

### 6. Zgodność hostowania i przeglądarek jest sprawdzana częściowo

Pomocnik uruchamia Edge z bezwzględnej ścieżki Windows i otwiera `file://`. Nie znaleziono aktywnej nawigacji testowej do aplikacji przez HTTP ani testów Firefox/WebKit.

Uruchamianie jako plik jest dobrze reprezentowane. Deklaracja działania także na GitHub Pages nie ma osobnego znalezionego smoke testu pochodzenia HTTP i względnych zasobów. Nie dowodzi to, że hosting nie działa. Test innych silników to rozszerzenie zakresu, a nie automatycznie obowiązek tego projektu.

### 7. Dokumentacja miesza aktualne instrukcje i historyczne checkpointy

Większość historycznych dokumentów poprawnie zaznacza datę i stan przed wdrożeniem. Nie raportować dawnych problemów renderera jako obecnych — WebGL został wdrożony.

Konkretne niespójności:

- `docs/ADAPTIVE-TESTING-CHECKPOINT.md`: początek mówi o domyślnych 4 workerach, ale dalej pozostało zdanie, że `--check` domyślnie oczekuje auto. Obecny CLI domyślnie oczekuje 4.
- `tests/CAD-BASELINE.md`: pozostała wzmianka o narzędziach testowych w `v1`, choć projekt nie ma już takiej wersji.
- `tests/REQUIREMENTS-TESTS.md`: fragment o aplikacji w `aplikacji`, mimo obecnego układu w katalogu głównym.
- `tests/USER-REGRESSIONS.md`: końcowe wskazanie `cad-latest-results.txt` zamiast obecnych raportów `test-runs`.
- `tests/WORKER-SCALING-RESULTS.md`: literalne znaki zapytania w miejscu wielu polskich znaków. Ten odczyt wykonano w UTF-8; nie mylić go z błędnym wyświetlaniem UTF-8 przez starsze `Get-Content`.
- `docs/ADAPTIVE-VALIDATION.json` zawiera bezwzględne ścieżki lokalnego komputera.

Automatyczna kontrola lokalnych linków Markdown wykazała siedem nieistniejących celów:

- `tests/TEST-BOTTLENECKS.md:71`: profile-before.json i profile-after.json.
- Ten sam dokument:72: comparison.json; :73: run-Ofg7X9/summary.json; :74: run-nnst7j/summary.json.
- `tests/WORKER-SCALING-RESULTS.md:43`: scaling-aMBToa/benchmark.json i analysis.json.

To odnośniki do lokalnych, ignorowanych artefaktów. Brak plików nie obala historycznych wyników, ale utrudnia ich niezależne sprawdzenie i odtworzenie.

## Kolejne kroki

1. Zweryfikować ekwiwalentne pokrycie siedmiu przykładów `parser-browser.cjs` i sklasyfikować pozostałe niezarejestrowane skrypty: historyczne / zastąpione / wymagające włączenia. Nie rejestrować hurtowo wszystkiego.
2. Zaplanować testy negatywne IndexedDB, zaczynając od abort i quota; bez grzebania w danych użytkownika.
3. Dokończyć kontrolę kompletności partycji i zakresu gwarancji runnera.
4. Ustalić, czy audyt ma przejść w poprawki, czy zakończyć się raportem. Dotychczasowe polecenie dotyczy analizy, nie szerokiej przebudowy.
5. Zaktualizować tylko rzeczywiście nieaktualne instrukcje, zachowując historyczne dane z datami i opisem wersji.
6. Jeśli powstaną zmiany w kodzie/testach, najpierw uruchomić dotknięte zestawy, potem jedną pełną regresję końcowej wersji. Jeśli tylko kontynuujemy odczyt niezmienionej wersji, zacząć od `--check`, bez powtarzania benchmarków.

Przy ostatecznym raporcie oddzielić: potwierdzone defekty mechanizmu testowania, luki pokrycia, nieaktualne dokumenty i zalecane rozszerzenia. Nie ma pomiaru procentowego pokrycia linii/gałęzi; liczba testów nie jest takim pomiarem.

## Kontynuacja — 28.10.2026

Analizę zakończono; raport końcowy: [TEST-AUDIT.md](TEST-AUDIT.md).

- Ponowny `--check` potwierdził ten sam zapisany pełny wynik, bez nowej regresji.
- `parser-browser.cjs`, `authors.cjs` i `clipboard.cjs` uruchomione offline zakończyły się kodem 0; nadal są poza `--all`.
- `metadata.cjs` zakończył się kodem 1 na zabronionym wywołaniu screenshot. Guard zablokował przechwytywanie; nie uznano tego za zaliczony test funkcji. Analogiczne wywołanie jest w `photo-editor.cjs`, którego nie uruchamiano.
- Celowane próby quota i abort zapisu obrazów pokazały prawidłowy komunikat zapisu tylko w sesji, możliwość ponowienia i odtworzenie po reload. Nie są jeszcze stałymi regresjami; awarie planu i pozostałe gałęzie nadal wymagają testów.
- Niezależne zarejestrowanie nazw w VM potwierdziło 117 przypadków bez partycji, 30/29/29/29 w partycjach, brak duplikatów i zgodność wszystkich nazw z zapisanym raportem. Ograniczenie ogólnej kontroli kompletności nie oznacza zgubienia przypadku w obecnej wersji.
- Kod, testy i konfiguracja pozostają bez zmian. Zmieniono wyłącznie dokumentację audytu: ten checkpoint i nowy raport końcowy.

Następny etap może realizować zalecenia raportu. Pierwotnym zakresem była analiza, więc nie rozpoczęto samodzielnie przebudowy testów ani aplikacji.

## Aktualizacja po wdrożeniu ulepszeń

Ulepszenia wynikające z audytu oraz końcową walidację opisano w [TEST-IMPROVEMENTS.md](TEST-IMPROVEMENTS.md). Pełny zestaw obejmuje teraz 357 przypadków (95 jednostkowych i 262 E2E); przebiegi na 1 i 4 workerach dały identyczne przypadki i wyniki. Powyższe obserwacje pozostają historycznym opisem stanu audytowanego przed zmianami.
