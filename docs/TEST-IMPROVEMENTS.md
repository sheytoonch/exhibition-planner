# Ulepszenia testów po audycie

Data: 28.10.2026. Podstawa: [TEST-AUDIT.md](TEST-AUDIT.md).

## Zrealizowany zakres

- Pięć istniejących scenariuszy biblioteki włączonych do pełnej regresji: parser-browser, autorzy, paste, metadane i edytor zdjęć. Zachowano wszystkie dotychczasowe asercje; dwa wywołania screenshotów zastąpiono liczbowymi sprawdzeniami. Każdy scenariusz wymusza offline również uruchamiany bezpośrednio.
- Siedem nowych przypadków ochrony zapisu: quota/abort osobno dla obrazów i planu, zmiana wersji bazy, niedostępne IndexedDB oraz nieczytelny rekord bez nadpisania danych. Testy korzystają z prawdziwych działań UI, świeżych kontekstów i kontrolowanego wstrzyknięcia awarii.
- Dwa przypadki hostowania i izolacji sieci: aplikacja w podkatalogu, względne zasoby, rzeczywiste rysowanie, zapis i reload; tylko jeden dokładny origin loopback jest dopuszczony, pozostałe są blokowane.
- Fingerprint obejmuje oba manifesty zależności oraz wszystkie pliki fixture. Regresje najpierw wykazały, że zmiana manifestów i JSON fixture nie unieważniała wyniku; po poprawce przechodzą.
- Runner zapisuje wersje Node, Playwright i uruchomionego Edge w raporcie. Osobny test chroni kompletność tych metadanych.
- Manifest 117 przypadków pomiarowych jest porównywany z unią czterech partycji i rzeczywistymi raportami. Testy odrzucają brakujący i powtórzony przypadek, także przy zgodnych licznikach samodzielnie zgłoszonego raportu.
- Uzupełniono README i mapę wymagań oraz poprawiono nieaktualne odniesienia do v1, katalogu aplikacji, starego pliku wyników i domyślnego trybu sprawdzania cache.

## Granice

Kod aplikacji (`index.html`, `app.js`, `style.css`) nie był zmieniany. Nie zmieniano kolejności zadań, liczby partycji, polityki schedulera ani domyślnych 4 workerów. Historyczne checkpointy i pomiary nie zostały przepisane na nowe wyniki. Nie wprowadzono innych silników przeglądarkowych ani nowej kategorii w licznikach; README wyjaśnia znaczenie obecnej kategorii E2E.

Nieczytelny rekord jest sprawdzany pod kątem zachowania danych i jawnego braku zapisu, nie automatycznej naprawy. Test zmiany wersji bazy sprawdza zamknięcie starego połączenia i pracę sesyjną, nie obsługę dowolnej przyszłej wersji schematu. Bezpośrednia gałąź `onblocked` pozostaje do rozszerzenia przy wprowadzaniu rzeczywistej migracji schematu.

## Walidacja

Testy celowane dodanego zakresu przeszły przed pełną regresją. Końcowe pełne przebiegi na 1 i 4 workerach zakończyły się powodzeniem: każdy obejmował **357 przypadków — 95 jednostkowych i 262 E2E**. Porównanie potwierdziło identyczny fingerprint oraz identyfikatory, typy i wyniki przypadków. `--check` potwierdził aktualność zapisanego wyniku bez ponownego uruchamiania testów.

| Przebieg | Czasy pracy workerów | Suma pracy | CPU średnie / szczyt | Ekwiwalent CPU średni / szczyt |
| --- | --- | --- | --- | --- |
| 1 worker | 213,8 s | 213,8 s | 17,9% / 31,8% | 3,6 / 6,4 |
| 4 workery | 80,2 / 80,2 / 80,1 / 80,1 s | 320,6 s | 58,9% / 92,5% | 11,8 / 18,5 |

Dostępne procesory logiczne: 20 w obu przebiegach. CPU i jego ekwiwalent dotyczą całego komputera. To kontrola zgodności, nie benchmark ani podstawa zmiany domyślnych 4 workerów.

Środowisko: Node v25.8.2, Playwright 1.64.0, Edge 156.0.4314.50. Fingerprint: `256bd505680a958d85f135ac8232af8e3b590f6cdfe0cebaba483d9ab4cc3859`.

Lokalne artefakty (ignorowane przez Git, dostępne na tym komputerze): `tests/test-runs/run-EtiANq/summary.json`, `tests/test-runs/run-1y7eOX/summary.json` oraz `tests/test-runs/test-improvements-validation.json`. Nie stanowią plików wymaganych do uruchamiania aplikacji.
