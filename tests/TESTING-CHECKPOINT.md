# Optymalizacja uruchamiania testów

Nowszy etap (4 workery, historia czasów, kompletność przypadków i brak zrzutów) zakończono w `PARALLEL-TESTING-CHECKPOINT.md`. Poniższy zapis dotyczy wcześniejszego etapu.

## Plan

1. Cichy raport i osobne logi zestawów.
2. Wybór zestawów albo pełna regresja jednym skryptem.
3. Skróty sprawdzonych plików, aktualizacja zasad i pełna weryfikacja.

## Stan

- Ukończono: 3/3.
- Istniejące testy i ich asercje pozostają bez zmian.
- Działa: cichy raport, osobne pełne logi, `summary.json` aktualizowany po każdym zestawie.
- Działa wybór: `node tests/cad-suite.cjs exhibition`, kilka nazw naraz, `--list`, `--all` i pełna regresja bez argumentów.
- Nieznane nazwy kończą polecenie błędem; podzbiór nie jest raportowany jako pełna regresja.
- Krok 3 zaimplementowany: SHA-256 kodu aplikacji i testów, wykrywanie zmian podczas przebiegu, `--check`, osobny wskaźnik ostatniej pełnej regresji i zasady w `AGENTS.md`.
- Zakończono pełną regresję: 41/41 zestawów, 184 s. Liczba wzrosła z 40 o testy skryptu uruchomieniowego; żaden dotychczasowy zestaw nie został usunięty.
- Raport: `test-runs/run-32kgQg/summary.json`. Pełne logi każdego zestawu są w tym samym katalogu.
- `node tests/cad-suite.cjs --check` potwierdził zgodność zapisanego pełnego sukcesu z aktualnym kodem, bez uruchamiania testów.
- Pozostało: nic w uzgodnionych krokach 1–3. Przyspieszanie samych testów, automatyczne zrzuty awarii i równoległość nie były częścią tej zmiany.
- Wznowienie: odczytaj `tests/test-runs/latest-full.json`, następnie wskazany `summary.json`. Jeżeli status to `running`, sprawdź, czy proces nadal pracuje. Jeżeli raport jest poprawny, użyj `node tests/cad-suite.cjs --check`; w razie braku zgodnego wyniku uruchom `--all`.

## Weryfikacja

- `node --test --test-isolation=none tests/cad-runner.test.cjs`: 2/2 testy przeszły; logi, błędy, timeout i postęp sprawdzone.
- `node tests/cad-suite.cjs cad-runner parser`: 2/2 zestawy przeszły poza sandboxem. Próba w sandboxie prawidłowo zaraportowała EPERM jako błąd.
- Aktualne testy skryptu: 4/4 przeszły, w tym skróty, zmiana plików, błędny zakres i niekompletne raporty.

## Polecenia

```powershell
node tests/cad-suite.cjs exhibition
node tests/cad-suite.cjs exhibition extrude
node tests/cad-suite.cjs --all
node tests/cad-suite.cjs --check
node tests/cad-suite.cjs --list
```

Raporty mają rozróżniony zakres, czasy zestawów, statusy i skróty SHA-256. `--check` nie zastępuje nowego testowania po zmianie środowiska lub danych; służy do rozpoznania zgodnego zapisanego wyniku.
