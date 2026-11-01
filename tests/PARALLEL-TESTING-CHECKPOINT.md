# Równoległe testowanie — checkpoint

## Plan
1. Kontrola kompletności przypadków i sprawdzanie wyglądu wartościami, bez zrzutów.
2. Czterech workerów, wspólna kolejka, izolacja wyników i blokady zasobów.
3. Pięć ostatnich poprawnych czasów na zestaw i liczbę workerów; najdłuższe zadania pierwsze.
4. Podział najwolniejszego zestawu bez usuwania przypadków i asercji.
5. Porównanie przypadków oraz wyników trybu sekwencyjnego i równoległego; krótki raport.

## Stan
- Ukończono 5/5. Raport przypadków, kontrola brakujących/pominiętych wyników, jawna klasyfikacja w `test-inventory.json`, 4 workery i historia 5 poprawnych czasów działają.
- Nowe pliki `*.test.cjs` są automatycznie wykrywane; brak klasyfikacji jest błędem, nie cichym pominięciem.
- Kolejka: nowe zadania najpierw, następnie malejąca średnia; historia osobna dla liczby workerów, zapis kontrolera pod blokadą pliku.
- Testy sterowania kolejką, blokad, historii i kompletności oraz 60 generowanych konfiguracji geometrii przeszły.
- Zrzuty usunięto z zestawów pełnej regresji. Porównania korzystają z wartości SVG/DOM, poleceń 2D, macierzy i buforów GPU. Skrypt zabrania wywołania `screenshot` w zależnościach testów.
- Krok 4 wdrożony: najwolniejszy plik ma 4 rozłączne partycje. Bez parametrów bezpośrednie uruchomienie pliku nadal wykonuje wszystkie 117 przypadków.
- Weryfikacja końcowa ukończona: pełne przebiegi 1 i 4 workerów wykonały identyczne przypadki, typy i wyniki na identycznej wersji kodu; `--compare` potwierdził zgodność. `--check --workers 4` potwierdził aktualność pełnego raportu.
- Wyniki częściowe: 10/10 testów skryptu/geometrii; 9/10 zestawów interfejsu równolegle, ostatni test 2D poprawiony i sprawdzony osobno razem ze skryptem.
- Naprawiono obsługę raportów starszych scenariuszy. Licznik asercji wymaga faktycznego wykonania sprawdzeń; sam kod wyjścia 0 nie wystarcza.
- Testy przeglądarkowe wymuszają tryb offline. Przechwytywanie bitmap blokowane jest statycznie i w Playwright. Odczyty kolorów GPU są sprawdzeniami liczbowymi, nie zrzutami.
- Poprawiono reset liczbowego podpisu poleceń 2D wraz z rzeczywistym czyszczeniem canvas. Test prawego przycisku ponownie przeszedł bez osłabienia sprawdzania obrazu.
- Ostatnie sprawdzenia kierowane: skrypt, scheduler, geometria, parser, storage, GPU i prawy przycisk przeszły. Zasady w `AGENTS.md` zaktualizowane.

## Wyniki końcowe
- 268 przypadków: 55 jednostkowych i 213 E2E; 43 zestawy źródłowe uruchamiane jako 46 zadań (najdłuższy zestaw w 4 partycjach).
- Kontrola sekwencyjna: `test-runs/run-4x2x3A/summary.json`; 191,0 s pracy jednego workera.
- Przebieg równoległy: `test-runs/run-1AVOvA/summary.json`; praca workerów 65,5 / 65,5 / 65,5 / 65,6 s, suma 262,1 s.
- Kontrolny wskaźnik raportu: `test-runs/sequential-validation.json`. Ostatni pełny wynik: `test-runs/latest-full.json`.
- 117 przypadków najwolniejszego zestawu zachowano w całości. Historie są rozdzielone między 1 i 4 workerów; po każdym poprawnym zadaniu zostaje najwyżej 5 ostatnich czasów.
- Kod aplikacji nie był zmieniany. Zmiany dotyczą testów, ich wykonania, dokumentacji i zasad pracy.

## Polecenia
```powershell
node tests/cad-suite.cjs --all
node tests/cad-suite.cjs --workers 4 exhibition extrude
node tests/cad-suite.cjs --workers 1 --all
node tests/cad-suite.cjs --compare tests/test-runs/run-4x2x3A/summary.json tests/test-runs/run-1AVOvA/summary.json
node tests/cad-suite.cjs --check --workers 4
```

Nie trzeba powtarzać kontrolnego przebiegu sekwencyjnego przy każdej zmianie aplikacji. Porównanie jest potrzebne przy zmianie planowania, partycji lub sposobu rozliczania przypadków. Kolejne pełne sprawdzenia standardowo używają 4 workerów.
- Nie zmieniamy kodu aplikacji ani osłabiamy asercji.
- Docelowy raport: liczba przypadków jednostkowych/E2E, czasy workerów i suma ich pracy.
