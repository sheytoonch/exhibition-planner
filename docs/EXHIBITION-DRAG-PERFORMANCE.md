# Przeciąganie obrazów w ekspozycji

Zgłoszenie: przy powolnym przesuwaniu dolnej pracy wzdłuż innych obrazów i linii odczuwalne były przycięcia.

Pomiar wykonano w lokalnym Edge, offline, na czterech pracach narysowanych przez interfejs. Zarejestrowano obsługę tych samych 24 rzeczywistych ruchów myszy przed i po zmianie, w kolejnych przebiegach. Mierzony czas obejmuje synchroniczną obsługę zdarzenia, nie cały czas klatki ani pracę GPU.

| Pomiar | Przed zmianą | Po zmianie |
|---|---:|---:|
| Średnia obsługa ruchu | 12,53 ms | 1,20 ms |
| Najdłuższa obsługa ruchu | 14,50 ms | 1,90 ms |
| Odczyty macierzy SVG | 2353 | 73 |
| Odczyty granic całego rysunku | 48 | 0 |
| Pełne przebudowy SVG | 48 | 0 |

Przyczyną było pełne renderowanie edytora wraz z biblioteką i ponownym dopasowaniem granic przy każdym ruchu. Dopasowanie wykonywało dodatkowy przebieg renderowania. Wielokrotne odczyty skali SVG przeplatały się ze zmianami DOM.

Podczas przeciągania aktualizowane są teraz transformacja przesuwanego elementu i odłączony fragment zawierający wymiary. Skala jest odczytywana raz dla tego przebiegu; obrazy, biblioteka i widok pozostają zachowane. Pełne renderowanie i dopasowanie następuje po zakończeniu lub anulowaniu ruchu. Przyciąganie oraz widoczność wszystkich wymiarów pozostają aktywne.

Regresja w `tests/exhibition.test.cjs` sprawdza stabilność elementów i widoku, ograniczoną liczbę odczytów układu, widoczność wymiarów, rzeczywisty ruch i zachowanie pozycji po odświeżeniu. Nie narzuca czasu w milisekundach, zależnego od sprzętu i obciążenia komputera.

Surowe wyniki tego pomiaru: `tests/test-runs/artwork-drag-before.json` oraz `tests/test-runs/artwork-drag-comparison.json`. Są lokalnymi artefaktami pomiarowymi, ignorowanymi przez Git.
