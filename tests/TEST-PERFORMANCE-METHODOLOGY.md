# Jak analizować i usprawniać testy

Ten dokument jest instrukcją dla kolejnego agenta. Opisuje metodę pracy, niezależnie od aktualnych czasów i sprzętu. Zasady aplikacji i testowania znajdują się w [AGENTS.md](../AGENTS.md). Wyniki wcześniejszych eksperymentów są materiałem porównawczym, nie gwarancją przyszłej wydajności.

## Najpierw ustal, co mierzysz

Rozdziel trzy wielkości:

- **Czas oczekiwania**: od rozpoczęcia do zakończenia całego zestawu, `durationMs`.
- **Suma czasów workerów**: `workMs`, czyli suma `workerMs`. Równoległe odcinki są liczone wielokrotnie. Obejmuje także oczekiwanie na przeglądarkę i wejście/wyjście; nie jest czasem CPU.
- **Obciążenie CPU**: obecny sampler mierzy cały komputer, łącznie z innymi aplikacjami. Ekwiwalent CPU nie jest liczbą rzeczywistych wątków testów.

Iloraz `workMs / (liczbaWorkerów * durationMs)` pokazuje udział czasu z przydzielonym zadaniem. Wysoki wynik oznacza brak dużych przestojów w przydziale, ale nie dowodzi efektywnego wykorzystania CPU ani braku oczekiwania wewnątrz zadania. Iloraz czasu jednego workera i liczby workerów to punkt odniesienia dla idealnego skalowania, nie obietnica wyniku.

## Mapa kodu

| Obszar | Pliki |
|---|---|
| Polecenia, wybór zestawów i skróty wersji | `cad-suite.cjs` |
| Tworzenie zadań, procesy, raporty i historia | `cad-execution.cjs` |
| Kolejność, sloty workerów, blokady i porównanie raportów | `test-scheduler.cjs` |
| Liczenie przypadków i klasyfikacja | `cad-reporter.cjs`, `test-inventory.json` |
| Przygotowanie sesji, kliknięcia, rysowanie i odczyt projektu | `cad-test-helpers.cjs` |
| Izolacja sieci i pomiary rysowania | `offline-tests.cjs`, `render-values.cjs` |
| Próbkowanie zasobów, tryb adaptacyjny i podsumowanie | `adaptive-workers.cjs`, `test-summary.cjs` |
| Serie porównawcze liczby workerów | `benchmark-workers.cjs` |

## Procedura szukania bottlenecków

1. **Sprawdź aktualny stan.** Przeczytaj wskazany przez `test-runs/latest-full.json` raport. Ustal wersję, zakres, status i liczbę przypadków. Raport `running`, `changed`, niepełny lub nieudany nie potwierdza aktualnej wersji. Zgodność zapisanego wyniku sprawdza `node tests/cad-suite.cjs --check`; to nie uruchamia testów.
2. **Wybierz konkretną hipotezę.** Przykłady: worker długo czeka bez zadania; pojedynczy plik tworzy długą końcówkę; zadania zwalniają przy większej równoległości; test wielokrotnie wykonuje to samo przygotowanie. Zapisz, jaki pomiar potwierdzi albo odrzuci hipotezę.
3. **Porównaj te same zadania.** Zestaw `durationMs` po identyfikatorze zadania, a potem po przypadku. Odróżnij wzrost czasu wewnątrz zadań od nierównych czasów pracy workerów. Sam całkowity czas ani średnie CPU nie wskazują przyczyny.
4. **Profiluj największy koszt.** W najdroższym zadaniu zmierz liczbę wywołań i czas: start przeglądarki, kontekst, strona, nawigacja, przygotowanie projektu, menu, kliknięcia, odczyt IndexedDB, obliczenia i zamknięcie. Oddziel przygotowanie od ciała testu. Nie dodawaj czasów nadrzędnej operacji do czasów jej podoperacji, bo liczysz tę samą pracę drugi raz.
5. **Odtwórz błąd przed naprawą.** Jeśli przyczyną jest błąd schedulera lub brak chronionego zachowania, najpierw dodaj test, który go wykrywa. Przy optymalizacji bez błędu funkcjonalnego zachowaj profil i zakres sprzed zmiany jako punkt odniesienia.
6. **Zmień jeden mechanizm i zmierz ponownie.** Przykładowo usuń ponowny wybór tego samego narzędzia z wewnętrznej pętli, pozostawiając rzeczywisty wybór przez UI na początku przypadku. Najpierw sprawdź dotknięty zestaw; dopiero po poprawnym wyniku sprawdzaj całość.
7. **Potwierdź zakres i wynik.** Porównaj przypadki, dane wejściowe, asercje i izolację. Po zmianie planowania wykonaj pełne przebiegi na jednym i czterech workerach, zgodnie z zasadami projektu. Jeśli nowe dane nie uzasadniają kolejnego eksperymentu, zakończ pomiary.

## Jak prowadzić uczciwe porównanie

- Uruchamiaj porównywane warianty kolejno. Równoległy benchmark obciąża sam siebie.
- Zachowaj kod, dane, wersję przeglądarki, tryb uruchomienia i porządek zadań. Zapisz warunki. Ogranicz inne obciążenie komputera.
- Dla porównania samej liczby workerów użyj wspólnej kopii historii czasów. Inaczej jeden wariant może korzystać z wyuczonej kolejności, a drugi z kolejności początkowej. `benchmark-workers.cjs` przygotowuje wspólny punkt odniesienia i zapisuje osobną historię eksperymentu.
- Gdy zmieniasz właśnie politykę kolejności, różna kolejność jest elementem eksperymentu. Utrzymaj pozostałe warunki i identyczny zakres przypadków.
- `--compare raport1.json raport4.json` wymaga zgodności wersji, identyfikatorów, typów i wyników przypadków. Liczba przypadków sama w sobie nie wystarcza.
- Porównując kod przed i po poprawce, spodziewaj się różnych skrótów wersji i możliwych zmian numerów linii w identyfikatorach. Porównaj wtedy dodatkowo zestawy `(plik, nazwa przypadku, typ, wynik)` i jawnie opisz każdy dodany lub usunięty przypadek. Nie obchodź kontroli wersji w zwykłym `--compare`.
- Przy małej lub niestabilnej różnicy wykonaj uzasadnione powtórzenia, ewentualnie zmieniając kolejność wariantów. Oddziel szum pomiarowy od poprawy. Jeden przebieg jest obserwacją, nie dowodem statystycznym.
- Wyniki, profile i skrypty jednorazowe zapisuj w osobnym katalogu `test-runs`. Nie zmieniaj badanych plików w trakcie przebiegu. Nie nadpisuj punktu odniesienia.

## Jak wybierać usprawnienia

- **Przestoje lub długa końcówka:** sprawdź historię kolejności, wielkość zadań i blokady zasobów. Dziel największy plik na niezależne partycje, zachowując każdy przypadek dokładnie raz. Blokady mogą być potrzebne do poprawności; nie usuwaj ich dla samego wyniku czasowego.
- **Równe obciążenie, ale wolniejsze zadania:** profiluj wnętrze testów i konkurencję procesów. Więcej partycji nie usuwa automatycznie kosztu powtarzanego menu, nawigacji ani czekania na przeglądarkę.
- **Powtarzane przygotowanie w pętli:** przenieś je poza pętlę, jeśli zachowanie aplikacji na to pozwala. Dodaj sprawdzanie, że każda iteracja nadal tworzy nowy wynik właściwego typu; samo odczytanie ostatniego wyniku może przeoczyć brak działania.
- **Historia po zmianie liczby workerów:** korzystaj z istniejących oszacowań do kolejności, ale zapisuj nowe czasy w osobnych kategoriach. Obsłuż również puste tablice próbek. Dokładna historia wariantu ma pierwszeństwo; nie kopiuj próbek pomiędzy kategoriami.
- **Koszt tworzenia sesji:** zmierz jego części osobno. Współdzielenie procesu przeglądarki bywa możliwe, ale zachowaj świeży kontekst, stan projektu i obsługę awarii właściwe dla testu. Nie współdziel stanu między przypadkami bez dowodu zachowania izolacji.
- **Koszt odczytów i komunikacji:** rozważ ich łączenie dopiero po pomiarze. Zachowaj sprawdzanie rzeczywistego stanu aplikacji i zapisu. Nie zastępuj działań E2E wywołaniami solvera lub manipulacją stanem.

Nie przyspieszaj zestawu przez usuwanie kombinacji, osłabianie asercji, `force: true`, ukrywanie błędów ponowieniami ani pomijanie potrzebnych warunków gotowości. Czekaj na konkretny stan zamiast dodawać stałe opóźnienia. Wygląd sprawdzaj liczbowo według zasad projektu, bez screenshotów.

## Zapis dla kolejnego agenta

Po zakończeniu opisz: hipotezę, sposób pomiaru, ustaloną przyczynę, wprowadzoną zmianę, zachowany zakres, wykonaną weryfikację i pozostałe niewiadome. Oddziel fakty od interpretacji. Linkuj do źródłowych raportów zamiast utrwalać same liczby w instrukcjach. Nie zmieniaj domyślnej liczby workerów na podstawie pojedynczego wyniku z innego komputera.

Aktualny trop do dalszej analizy: rozbić przygotowanie świeżej sesji na tworzenie kontekstu, strony, nawigację i otwarcie pustego projektu przez UI. Dotychczasowa analiza: [TEST-BOTTLENECKS.md](TEST-BOTTLENECKS.md). To wskazówka do pomiaru, nie potwierdzenie przyczyny ani polecenie automatycznego uruchamiania benchmarków.

## Aktualizacja po audycie

Runner hashuje także manifesty zależności oraz `tests/fixtures`. Raport zapisuje wersje Node, Playwright i przeglądarki. Przed oceną wyników partycji pomiarów zbiera wykaz nazw bez wykonywania ciał testów i porównuje go z faktycznym raportem danej partycji. `case-manifest.test.cjs` niezależnie kontroluje rozłączność, pełną unię i chroniony zakres 117 przypadków. Kolejność zadań, liczba partycji i polityka workerów nie zostały zmienione.
