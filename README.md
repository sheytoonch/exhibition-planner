# Wystawa — planer wystaw 0.1

Aplikacja przeglądarkowa bez backendu. Dane projektów i zoptymalizowane grafiki pozostają lokalnie w IndexedDB; eksport `.exhibition` pozwala przenosić je między komputerami.

## Uruchomienie

Wymagany Node.js 22.18+ (lub 24+).

```powershell
npm.cmd install
npm.cmd run dev
```

Podgląd: `http://127.0.0.1:5173`. Jeśli PowerShell lub środowisko nieprawidłowo obsługuje skrypt npm, można użyć bezpośrednio `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" run dev`.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

Build tworzy katalog `dist/`, gotowy na hosting statyczny. Aplikacja nie potrzebuje serwera API. Czcionki mają systemowy fallback; pierwsze pobranie Google Fonts wymaga sieci. To nie jest jeszcze instalowalna aplikacja PWA.

## Funkcje pierwszej wersji

- Rzut SVG, rysowanie łańcucha ścian, edycja końców i całych ścian, dokładne długości, wysokości, grubości oraz kąty między połączonymi ścianami.
- Miarka 2D, linie wymiarowe, przyciąganie do siatki 10 cm i narożników, zoom i przesuwanie widoku.
- Drzwi i okna z rzeczywistymi otworami w 3D.
- Import JPG, PNG, WebP i wybranych stron PDF jako obrazy lub podkład. Kalibracja podkładu na podstawie znanej odległości.
- Biblioteka prac; odczyt wymiarów z nazwy pliku i opisu; ręczna korekta i zamiana boków.
- Przeciąganie z biblioteki na rzut i do 3D, mocowanie do ściany lub pozycja swobodna. Widok ściany do zmiany wysokości i odstępów.
- Kilka niezależnie zapisywanych projektów, kopiowanie projektu jako wariantu, import samych prac lub przestrzeni.
- Eksport projektu, biblioteki i przestrzeni do samodzielnego archiwum `.exhibition`.
- Notatki z autorem i statusem; cofanie/ponawianie ostatnich 35 operacji w bieżącej sesji.
- Automatyczny zapis w IndexedDB. Eksport do pliku jest kopią zapasową; czyszczenie danych przeglądarki usuwa lokalne projekty.

## Obsługa

- `W`: ściany, `M`: miarka, `V`: zaznaczanie, `Esc`: zakończenie narzędzia.
- Kółko myszy: zoom. Spacja + przeciąganie lub środkowy przycisk: przesuwanie rzutu.
- Przeciągnij obraz na ścianę. `Alt` podczas przesuwania obrazu w rzucie wyłącza mocowanie.
- W 3D przeciągnij tło, aby obrócić kamerę. Przeciągaj obraz po jego ścianie; prace swobodne przesuwają się poziomo, a wysokość zmienia się w panelu.
- `Delete`: usunięcie zaznaczonego elementu, `Ctrl+Z`: cofnięcie, `Ctrl+Shift+Z`: ponowienie, `Ctrl+S`: eksport.
- Kliknij ścianę, aby edytować długość i kąt. Długości dotyczą osi ścian. Zmiana wspólnego końca może zmieniać długość sąsiedniej ściany; nie ma jeszcze solvera więzów CAD.

## Ograniczenia i kolejny etap

- Jedna kondygnacja. Brak schodów, brył zastępczych rzeźb i korekty perspektywy.
- Notatki są częścią pliku; brak porównywania i scalania wersji oraz rozstrzygania konfliktów. Import całego pliku otwiera osobny projekt.
- Podkład jest zablokowany przed przeciąganiem. W tej wersji dostępna jest kalibracja i przezroczystość, bez kadrowania i obrotu.
- Miarka działa na rzucie 2D; pomiary 3D i rozbudowane wyrównywanie prac pozostają do dodania.
- Parser rozpoznaje pierwszy pasujący wymiar w opisie. Przy imporcie orientację sugeruje proporcja grafiki; przy odczycie ręcznie wklejonego opisu można zamienić boki przyciskiem.
- Przy ponownym imporcie biblioteki prace o istniejących identyfikatorach są pomijane. Aktualizacja istniejących prac i podmiana grafiki będą rozwinięte w następnej wersji.
- Domyślne grafiki są ilustracyjnymi przykładami SVG, nie zaimportowanymi pracami użytkownika.
- Import grafiki/PDF: maksymalnie 100 MB na plik i 100 MP dla obrazów; plik 200 MB należy wcześniej zmniejszyć. Samo dekodowanie dużego obrazu nadal wymaga pamięci. Kopie mają do 1600 px na dłuższym boku, podkłady do 3000 px.
- Eksport zawiera lekkie kopie, bez oryginałów. Archiwum importu: do 150 MB, suma rozpakowanych wpisów do 350 MB.
- Rzut i edycja są wygodniejsze na komputerze. Telefon ma układ pionowy; pełne sterowanie dotykowe wymaga dalszych prac.

## Testy

Testy modelu obejmują parser wymiarów, zależności ściana–obraz, usuwanie i walidację danych.

Testy przeglądarkowe: `npm.cmd run test:browser` przy uruchomionym serwerze developerskim. Konfiguracja używa lokalnego Microsoft Edge w Windows. Dla innych systemów ustaw odpowiedni `channel` lub `executablePath` w `playwright.config.ts`.

## Struktura

- `src/model.ts`: typy, geometria i walidacja.
- `src/io.ts`: IndexedDB, archiwum, PDF i optymalizacja grafiki.
- `src/Plan.tsx`, `src/Scene.tsx`, `src/Elevation.tsx`: trzy widoki wspólnego modelu.
- `src/App.tsx`: projekty, historia, biblioteka, narzędzia i właściwości.
- `tests/`: testy logiki i przepływów użytkownika.

Format archiwum: ZIP z `manifest.json` (`format: "wystawa"`, `version: 1`, `kind`) oraz plikami `assets/*.txt` zawierającymi zoptymalizowane grafiki jako data URL. Powtarzające się grafiki są deduplikowane przy eksporcie. Import nie rozpakowuje plików do systemu plików.
