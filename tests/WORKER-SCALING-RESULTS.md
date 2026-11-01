# Por?wnanie 1?6 worker?w ? 25.10.2026

Wykonano sze?? nowych, kolejnych pe?nych przebieg?w: 1, 2, 3, 4, 5, 6 worker?w. Ka?dy zako?czy? si? poprawnie: 64 przypadki jednostkowe i 220 E2E (284 ??cznie), 47 zada?. Por?wnanie identyfikator?w przypadk?w, wynik?w, skr?tu kodu oraz kolejno?ci zada? potwierdzi?o zgodno?? wszystkich przebieg?w. Nie zmieniano aplikacji ani test?w pomi?dzy pomiarami.

Ka?dy wariant dosta? t? sam? kolejno?? zada?: na podstawie wsp?lnej kopii historii czas?w dla 2 worker?w, z histori? dla 4 worker?w jako rezerw?. Historia zwyk?ego uruchamiania nie zosta?a zmieniona. Najwi?kszy zestaw pozosta? podzielony na 4 identyczne partycje we wszystkich wariantach.

| Workery | Czas oczekiwania | Idea? wzgl?dem 1 workera | Przyspieszenie | Sprawno?? wzgl?dem idea?u | Suma pracy | Czas z przydzielonym zadaniem |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 193,6 s | 193,6 s | 1,00? | 100,0% | 193,5 s | 100,0% |
| 2 | 104,1 s | 96,8 s | 1,86? | 93,0% | 208,1 s | 99,9% |
| 3 | 76,2 s | 64,5 s | 2,54? | 84,7% | 228,3 s | 99,9% |
| 4 | 64,9 s | 48,4 s | 2,98? | 74,6% | 258,9 s | 99,7% |
| 5 | 58,8 s | 38,7 s | 3,29? | 65,9% | 292,6 s | 99,6% |
| 6 | 55,9 s | 32,3 s | 3,47? | 57,8% | 332,9 s | 99,3% |

?Czas z przydzielonym zadaniem? = suma czas?w zada? / (liczba worker?w ? czas oczekiwania). Obejmuje czekanie na przegl?dark? i operacje wej?cia/wyj?cia; nie oznacza wykorzystania CPU. ?Suma pracy? sumuje nak?adaj?ce si? odcinki czasu worker?w i nie jest czasem CPU.

| Workery | Czasy poszczeg?lnych worker?w [s] | CPU komputera ?rednie / szczyt | Ekwiwalent CPU ?redni / szczyt | Dost?pne procesory logiczne | Minimum wolnej pami?ci |
|---:|---|---:|---:|---:|---:|
| 1 | 193,5 | 16,4% / 35,7% | 3,3 / 7,1 | 20?20 | 16,9 GiB |
| 2 | 104,1 / 104,0 | 27,5% / 53,6% | 5,5 / 10,7 | 20?20 | 16,7 GiB |
| 3 | 76,1 / 76,1 / 76,1 | 40,4% / 62,1% | 8,1 / 12,4 | 20?20 | 16,4 GiB |
| 4 | 64,7 / 64,7 / 64,9 / 64,6 | 52,6% / 82,6% | 10,5 / 16,5 | 20?20 | 15,7 GiB |
| 5 | 58,7 / 58,3 / 58,5 / 58,8 / 58,3 | 65,0% / 91,6% | 13,0 / 18,3 | 20?20 | 16,1 GiB |
| 6 | 55,8 / 55,3 / 55,5 / 55,5 / 55,4 / 55,4 | 74,4% / 95,4% | 14,9 / 19,1 | 20?20 | 15,3 GiB |

Obci??enie CPU dotyczy ca?ego komputera, ??cznie z innymi procesami. Ekwiwalent CPU nie jest liczb? rzeczywistych w?tk?w test?w. CPU: 12th Gen Intel(R) Core(TM) i7-12700KF; Node: v25.8.2.

## Co wynika z pomiar?w

- Przydzia? zada? jest r?wny: przy 2?6 workerach czas z przydzielonym zadaniem wynosi 99,3?99,9%. W wariancie 6-workerowym r??nica mi?dzy najkr?cej i najd?u?ej pracuj?cym workerem wynosi zaledwie 0,52 s. Brak podstaw, aby strat? skalowania przypisa? przestojom schedulera lub d?ugiej ko?c?wce pojedynczego zadania.
- Te same zadania zwalniaj? przy wi?kszej r?wnoleg?o?ci. Suma ich czas?w wzros?a ze 193,5 do 332,9 s (72,0%). To bezpo?rednio wyja?nia wi?kszo?? r??nicy wzgl?dem idealnego przyspieszenia.
- Cztery najwi?ksze partycje pomiar?w trwaj? pojedynczo oko?o 24?25 s przy 1 workerze i 43?44 s przy 6. Wszystkie sprawdzaj? te same przypadki. Wzrost obejmuje wiele zestaw?w E2E, nie tylko renderowanie 3D.
- Przy 6 workerach CPU komputera osi?ga ?rednio 74,4%, szczytowo 95,4%; wolnej pami?ci pozostaje co najmniej 15,3 GiB. Wyniki s? zgodne z narastaj?c? konkurencj? przegl?darek o zasoby. Sam ten pomiar nie rozdziela wp?ywu CPU, GPU, IPC, oczekiwania na klatki oraz kosztu uruchamiania przegl?darek. Brak dowodu na niedob?r pami?ci RAM.
- Dodanie pi?tego workera oszcz?dza 6,1 s, a sz?stego tylko 2,9 s. Najszybszy zmierzony wariant to 6 worker?w, ale 4 workery zapewniaj? znacznie ni?sze obci??enie za cen? 9,0 s dodatkowego oczekiwania. Nie zmieniono domy?lnego ustawienia 4 worker?w.

## Ograniczenia i odtwarzanie

Jeden pomiar ka?dego wariantu, w kolejno?ci rosn?cej. Nie jest to statystyczna seria powt?rze?; pomiar nie izoluje zmian temperatury, taktowania, cache ani pracy innych aplikacji. Sta?y kod, dane i porz?dek zada? ograniczaj? r??nice w konfiguracji, ale nie eliminuj? tych czynnik?w.

Powt?rzenie ca?ej serii: `node tests/benchmark-workers.cjs`.

?r?d?a: [benchmark.json](test-runs/scaling-aMBToa/benchmark.json), [analysis.json](test-runs/scaling-aMBToa/analysis.json). Pe?ne raporty przypadk?w i logi znajduj? si? w podkatalogach `workers-1` do `workers-6`.

Skr?t badanej wersji: `152ccb8aa423c26125a9eb69bdac4515d7861d4f2bb5e8d4ae0a8c092538a359`.
