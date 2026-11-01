# Reguły wykrywacza aplikacji

To notatka pomocnicza. Aplikacja nadal składa się wyłącznie z HTML, JS i CSS.

- Wykrywacz przechowuje zakresy znaków i używa ich również do kolorowych oznaczeń. Wymiary są rozpoznawane i maskowane przed szukaniem dat.
- Wartości fizyczne są przeliczane na cm; obsługiwane są mm, m i cale (także ułamki). Oznaczenia H/W i wys./szer. są nadrzędne wobec orientacji grafiki. Dla wymiarów bez oznaczeń domyślna konwencja to wysokość × szerokość, korygowana proporcjami zdjęcia zgodnie z wcześniejszymi ustaleniami.
- Format A/B jest zastępczy wobec jawnie podanych wymiarów.
- Głębokość i rozmiar ramy pozostają w danych wykrycia `dimensionCandidates`; obecny formularz nadal edytuje szerokość i wysokość pracy.
- Piksele, typowe rozdzielczości i proporcje nie uzupełniają pól cm. Zapisy bez jednostki są heurystyką: typowa para 1920×1080, bardzo duże pary i pary z kontekstem dpi są traktowane jako cyfrowe, a 16×9, 4×3, 1×1 jako proporcje. Jawna jednostka fizyczna usuwa tę niejednoznaczność. Piksele nie są przeliczane na cm na podstawie domniemanego dpi.
- Daty są kalendarzowo sprawdzane; znacznik czasu służy do odczytu dnia, nie godziny wykonania dzieła.
- Zapisy około/przypuszczalne zachowują flagę niepewności. Przedziały i przed/po nie stają się dokładną datą.
- Wieki i dekady zachowują własną precyzję. Przedziały służą do przyszłego sortowania: wiek XX to 1901–2000, połowy dzielą ten zakres po 50 latach. Początek/środek/koniec są umownymi tercjami, oznaczonymi jako przybliżenie, a nie ustaloną datą historyczną.
- Sam zapis „lata 70.” nie powoduje dopisania wieku. Niejednoznaczne daty z myślnikami, np. 03-04-2024, nie są zgadywane; należy użyć DD.MM.RRRR lub ISO. Jednoznaczny zapis 03-29-2024 jest rozpoznawany jako amerykański.
- Rok 300 p.n.e. jest przechowywany z oznaczeniem ery i kluczem chronologicznym (astronomiczny rok -299), bez konwersji przez obiekt Date przeglądarki.
- Wiele różnych kandydatów pozostaje do ręcznego wyboru. Automatyka chroni ręczne poprawki, a historia obejmuje przypisania i edycję.

Uruchomienie testów logiki: `node tests/parser.cjs`.

Testy `parser-browser.cjs` sprawdzają cały import przykładów ze ściągi. Rozszerzenia plików w testach wykrywacza są tekstem do analizy; nie oznacza to dodania dekodera TIFF do przeglądarki.

Bieżący zakres: ten scenariusz należy do pełnej regresji `node tests/cad-suite.cjs --all`, razem z `metadata.cjs`, `authors.cjs`, `clipboard.cjs` i `photo-editor.cjs`. Wszystkie działają offline, bez przechwytywania bitmap.
