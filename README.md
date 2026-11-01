# Exhibition Planner

Aplikacja znajduje się w katalogu głównym repozytorium.
Otwórz `index.html` bezpośrednio w przeglądarce. Aplikacja nie wymaga
instalacji zależności, serwera ani procesu budowania. Można również udostępnić
ten katalog jako statyczną stronę, np. przez GitHub Pages.

Projekt i obrazy są zapisywane lokalnie w przeglądarce. Identyfikator bazy
danych pozostaje zachowany dla zgodności z dotychczasowymi zapisami.

## Testy

Zależności Node.js dotyczą wyłącznie narzędzi testowych w `tests`.
Wymagany jest Node.js oraz Microsoft Edge.

```powershell
npm.cmd ci --prefix tests
node tests/cad-suite.cjs --all
```

Lista zestawów: `node tests/cad-suite.cjs --list`.
Raporty są generowane w ignorowanym przez Git katalogu `tests/test-runs`.
Dokumentacja obecnej aplikacji znajduje się w `docs` oraz `tests`.

## Zakres i wiarygodność testów

Pełna regresja obejmuje także import nazw i metadanych, autorów, wklejanie obrazów, edytor zdjęć, awarie zapisu IndexedDB i uruchomienie aplikacji przez lokalny serwer statyczny z podkatalogu. Dokładna mapa wymagań: [tests/REQUIREMENTS-TESTS.md](tests/REQUIREMENTS-TESTS.md).

Domyślnie testy przeglądarkowe są offline. Wyłącznie test statycznego hostowania dopuszcza jeden dokładny origin HTTP na `127.0.0.1` z losowym portem. Inne originy, również na innym porcie loopback, pozostają zablokowane. Testy nie kontaktują się z GitHub Pages ani internetem i nie odczytują schowka systemowego.

`--check` dotyczy zapisanego wyniku. Fingerprint obejmuje kod, manifesty zależności testowych i fixture; raport przechowuje wersje środowiska. Zmiana przeglądarki lub niezarejestrowanych danych nadal wymaga nowego sprawdzenia. Kategoria E2E w obecnym runnerze obejmuje również integracyjne testy komponentów GPU uruchamianych w przeglądarce, nie tylko pełne ścieżki użytkownika.

Wdrożone ulepszenia i walidacja: [docs/TEST-IMPROVEMENTS.md](docs/TEST-IMPROVEMENTS.md).
