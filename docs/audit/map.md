# Mapa kodu do audytu

Wygenerowana przez `node tests/audit/map.js` — nie poprawiać ręcznie.

## Moduły

| Plik                  | Linie | Obiekty                          | Nasłuchy DOM                  | Timery                  | Zapisy do magazynu                                                                                |
| --------------------- | ----- | -------------------------------- | ----------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| `00-banner.js`        | 59    |                                  |                               |                         |                                                                                                   |
| `00-targets.js`       | 21    |                                  |                               |                         |                                                                                                   |
| `01-config.js`        | 699   | CONFIG                           |                               |                         |                                                                                                   |
| `02-i18n-strings.js`  | 615   |                                  |                               |                         |                                                                                                   |
| `03-utils.js`         | 219   | Utils                            |                               | setTimeout              |                                                                                                   |
| `04-core-state.js`    | 262   | Perf                             |                               |                         |                                                                                                   |
| `05-i18n-runtime.js`  | 28    |                                  |                               |                         |                                                                                                   |
| `06-storage.js`       | 465   | Persistence                      | storage                       | setTimeout              | localStorage.setItem, Persistence.scheduleSave, Persistence.saveState, localStorage.removeItem ×4 |
| `07-session-shift.js` | 236   | SessionReset, ShiftManager       |                               |                         | localStorage.removeItem, Persistence.saveState ×2, Persistence.write                              |
| `08-drag.js`          | 75    |                                  | mousedown, mousemove, mouseup |                         | Persistence.saveState                                                                             |
| `09-ui-css.js`        | 49    | CSSManager                       |                               |                         |                                                                                                   |
| `10-ui-window.js`     | 389   | StatsWindowRenderer              |                               | setInterval             |                                                                                                   |
| `11-ui-builder.js`    | 63    | UIBuilder                        |                               |                         |                                                                                                   |
| `12-ui-settings.js`   | 790   | SettingsPanel                    |                               | setTimeout ×3           | Persistence.saveState, localStorage.removeItem ×2                                                 |
| `13-ui-visuals.js`    | 87    | VisualsRenderer, Notifier        |                               | setTimeout              |                                                                                                   |
| `14-marketplace.js`   | 26    |                                  |                               |                         |                                                                                                   |
| `15-price-sources.js` | 687   | PriceNet, KeepaOCR, PriceSources |                               | setTimeout              |                                                                                                   |
| `16-value-log.js`     | 420   | ValueLog                         |                               | setTimeout ×2           | localStorage.setItem ×2, Persistence.write, localStorage.removeItem                               |
| `17-fx-rates.js`      | 224   | FxRates                          |                               | setTimeout              | localStorage.setItem, localStorage.removeItem                                                     |
| `18-routing.js`       | 309   | Routing                          |                               |                         | Persistence.bump ×2                                                                               |
| `19-price-module.js`  | 37    | PriceModule                      |                               |                         | Persistence.saveState ×2                                                                          |
| `20-price-card.js`    | 912   | PriceCard                        | securitypolicyviolation       | setTimeout ×4           |                                                                                                   |
| `21-input.js`         | 275   | InputManager, AutoTrigger        | keydown                       | setInterval             | Persistence.bump                                                                                  |
| `22-bootstrap.js`     | 437   | Main                             | pagehide                      | setInterval             | sessionStorage.setItem, Persistence.scheduleSave ×3, Persistence.saveState                        |
| `23-config-code.js`   | 464   | ConfigCode                       |                               |                         | Persistence.saveState                                                                             |
| `24-tasks.js`         | 768   | TaskManager                      |                               |                         | Persistence.write, Persistence.saveTasks                                                          |
| `25-presets.js`       | 79    |                                  | DOMContentLoaded              |                         | Persistence.saveState                                                                             |
| `26-tote-watch.js`    | 101   | ToteWatch                        | keydown                       |                         |                                                                                                   |
| `27-gravis.js`        | 274   | GravisBridge                     | keydown, message ×2           | setInterval, setTimeout |                                                                                                   |
| `28-auto-lpn.js`      | 32    | AutoLpn                          | input                         |                         |                                                                                                   |
| `29-diagnostics.js`   | 97    | Diag                             |                               | setInterval             |                                                                                                   |
| `99-footer.js`        | 199   |                                  |                               |                         | Persistence.saveState ×3                                                                          |

## Zdarzenia szyny: kto nadaje, kto słucha

| Zdarzenie                                            | Nadaje                                              | Słucha                              |
| ---------------------------------------------------- | --------------------------------------------------- | ----------------------------------- |
| `item:completed`                                     | 21-input.js                                         | 22-bootstrap.js                     |
| `page:scanned`                                       | 21-input.js                                         | 20-price-card.js, 27-gravis.js      |
| `price:asinChanged`                                  | 20-price-card.js                                    | 22-bootstrap.js                     |
| `session:reset`                                      | 07-session-shift.js                                 | 13-ui-visuals.js                    |
| `storage:writeFailed`                                | 06-storage.js                                       | 13-ui-visuals.js                    |
| `store:changed`                                      | — (createReactive)                                  | 04-core-state.js                    |
| `store:changed:localTabConfig.priceCard.logValues`   | — (createReactive)                                  | 20-price-card.js                    |
| `store:changed:localTabConfig.priceCard.source`      | — (createReactive)                                  | 20-price-card.js                    |
| `store:changed:uiFlags.isPriceCardDragging`          | — (createReactive)                                  | 12-ui-settings.js, 20-price-card.js |
| `store:changed:uiFlags.isStatsWindowDragging`        | — (createReactive)                                  | 10-ui-window.js, 12-ui-settings.js  |
| `store:changed:uiFlags.itemInProgress`               | — (createReactive)                                  | 20-price-card.js, 22-bootstrap.js   |
| `store:changed:userConfig.marketplace`               | — (createReactive)                                  | 20-price-card.js                    |
| `store:changed:userConfig.triggerMutationDebounceMs` | — (createReactive)                                  | 21-input.js                         |
| `valueLog:changed`                                   | 16-value-log.js, 17-fx-rates.js, 19-price-module.js | 10-ui-window.js                     |

## Reakcje na zmiany stanu (onStorePaths)

- `09-ui-css.js`: 'localTabConfig'
- `10-ui-window.js`: 'tabCounters', 'tabSold', 'tabNeutral', 'tasks', 'activeTaskId', 'taskCounters', 'sessionConfig', 'userConfig', 'localTabConfig'
- `10-ui-window.js`: 'localTabConfig.statsWindowPosition'
- `13-ui-visuals.js`: 'localTabConfig', 'userConfig', 'currentTabType', 'currentTabInstanceId'
- `20-price-card.js`: 'localTabConfig.priceCard', 'userConfig.language'
- `22-bootstrap.js`: 'userConfig', 'sessionConfig', 'localTabConfig'
