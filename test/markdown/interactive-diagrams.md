## Interactive Vega

---

`vega-lite {interactive}` simple

```vega-lite {interactive}
{
  "$schema": "https://vega.github.io/schema/vega-lite/v3.json",
  "description": "A simple bar chart with embedded data.",
  "data": {
    "values": [
      {"a": "A","b": 28}, {"a": "B","b": 55}, {"a": "C","b": 43},
      {"a": "D","b": 91}, {"a": "E","b": 81}, {"a": "F","b": 53},
      {"a": "G","b": 19}, {"a": "H","b": 87}, {"a": "I","b": 52}
    ]
  },
  "selection": {
    "bars": {"type": "single"}
  },
  "mark": "bar",
  "encoding": {
    "x": {"field": "a", "type": "ordinal"},
    "y": {"field": "b", "type": "quantitative"},
    "color": {
      "condition": {
        "selection": "bars",
        "value": "rgb(76, 120, 168)"
      },
      "value": "black"
    }
  }
}
```

`vega-lite {interactive}` yaml

```vega-lite {interactive}
$schema: https://vega.github.io/schema/vega-lite/v3.json
description: A simple bar chart with embedded data.
data:
  values: [
    {"a": "A","b": 28}, {"a": "B","b": 55}, {"a": "C","b": 43},
    {"a": "D","b": 91}, {"a": "E","b": 81}, {"a": "F","b": 53},
    {"a": "G","b": 19}, {"a": "H","b": 87}, {"a": "I","b": 52}
  ]
selection:
  bars:
    type: single
mark: bar
encoding:
  x:
    field: a
    type: ordinal
  y:
    field: b
    type: quantitative
  color:
    condition:
      selection: bars
      value: rgb(76, 120, 168)
    value: black
```

`vega-lite {interactive}` with local data file (`data/sp500.csv`)

```vega-lite {interactive}
{
  "$schema": "https://vega.github.io/schema/vega-lite/v3.json",
  "data": {"url": "data/sp500.csv"},
  "vconcat": [{
    "width": 480,
    "mark": "area",
    "encoding": {
      "x": {
        "field": "date",
        "type": "temporal",
        "scale": {"domain": {"selection": "brush"}},
        "axis": {"title": ""}
      },
      "y": {"field": "price","type": "quantitative"}
    }
  }, {
    "width": 480,
    "height": 60,
    "mark": "area",
    "selection": {
      "brush": {"type": "interval", "encodings": ["x"]}
    },
    "encoding": {
      "x": {
        "field": "date",
        "type": "temporal",
        "axis": {"format": "%Y"}
      },
      "y": {
        "field": "price",
        "type": "quantitative",
        "axis": {"tickCount": 3, "grid": false}
      }
    }
  }]
}
```

---

`vega-lite {interactive hide=false}` with remote data file (`https://vega.github.io/vega-lite/data/sp500.csv`) + don't hide source

```vega-lite {interactive hide=false}
{
  "$schema": "https://vega.github.io/schema/vega-lite/v3.json",
  "data": {"url": "https://vega.github.io/vega-lite/data/sp500.csv"},
  "vconcat": [{
    "width": 480,
    "mark": "area",
    "encoding": {
      "x": {
        "field": "date",
        "type": "temporal",
        "scale": {"domain": {"selection": "brush"}},
        "axis": {"title": ""}
      },
      "y": {"field": "price","type": "quantitative"}
    }
  }, {
    "width": 480,
    "height": 60,
    "mark": "area",
    "selection": {
      "brush": {"type": "interval", "encodings": ["x"]}
    },
    "encoding": {
      "x": {
        "field": "date",
        "type": "temporal",
        "axis": {"format": "%Y"}
      },
      "y": {
        "field": "price",
        "type": "quantitative",
        "axis": {"tickCount": 3, "grid": false}
      }
    }
  }]
}
```

---

`vega {interactive}` with remote data file

```vega {interactive}
{
  "$schema": "https://vega.github.io/schema/vega/v5.json",
  "width": 720,
  "height": 480,
  "padding": 5,

  "data": [
    {
      "name": "sp500",
      "url": "https://vega.github.io/vega-lite/data/sp500.csv",
      "format": {"type": "csv", "parse": {"price": "number", "date": "date"}}
    }
  ],

  "signals": [
    {
      "name": "detailDomain"
    }
  ],

  "marks": [
    {
      "type": "group",
      "name": "detail",
      "encode": {
        "enter": {
          "height": {"value": 390},
          "width": {"value": 720}
        }
      },
      "scales": [
        {
          "name": "xDetail",
          "type": "time",
          "range": "width",
          "domain": {"data": "sp500", "field": "date"},
          "domainRaw": {"signal": "detailDomain"}
        },
        {
          "name": "yDetail",
          "type": "linear",
          "range": [390, 0],
          "domain": {"data": "sp500", "field": "price"},
          "nice": true, "zero": true
        }
      ],
      "axes": [
        {"orient": "bottom", "scale": "xDetail"},
        {"orient": "left", "scale": "yDetail"}
      ],
      "marks": [
        {
          "type": "group",
          "encode": {
            "enter": {
              "height": {"field": {"group": "height"}},
              "width": {"field": {"group": "width"}},
              "clip": {"value": true}
            }
          },
          "marks": [
            {
              "type": "area",
              "from": {"data": "sp500"},
              "encode": {
                "update": {
                  "x": {"scale": "xDetail", "field": "date"},
                  "y": {"scale": "yDetail", "field": "price"},
                  "y2": {"scale": "yDetail", "value": 0},
                  "fill": {"value": "steelblue"}
                }
              }
            }
          ]
        }
      ]
    },

    {
      "type": "group",
      "name": "overview",
      "encode": {
        "enter": {
          "x": {"value": 0},
          "y": {"value": 430},
          "height": {"value": 70},
          "width": {"value": 720},
          "fill": {"value": "transparent"}
        }
      },
      "signals": [
        {
          "name": "brush", "value": 0,
          "on": [
            {
              "events": "@overview:mousedown",
              "update": "[x(), x()]"
            },
            {
              "events": "[@overview:mousedown, window:mouseup] > window:mousemove!",
              "update": "[brush[0], clamp(x(), 0, width)]"
            },
            {
              "events": {"signal": "delta"},
              "update": "clampRange([anchor[0] + delta, anchor[1] + delta], 0, width)"
            }
          ]
        },
        {
          "name": "anchor", "value": null,
          "on": [{"events": "@brush:mousedown", "update": "slice(brush)"}]
        },
        {
          "name": "xdown", "value": 0,
          "on": [{"events": "@brush:mousedown", "update": "x()"}]
        },
        {
          "name": "delta", "value": 0,
          "on": [
            {
              "events": "[@brush:mousedown, window:mouseup] > window:mousemove!",
              "update": "x() - xdown"
            }
          ]
        },
        {
          "name": "detailDomain",
          "push": "outer",
          "on": [
            {
              "events": {"signal": "brush"},
              "update": "span(brush) ? invert('xOverview', brush) : null"
            }
          ]
        }
      ],
      "scales": [
        {
          "name": "xOverview",
          "type": "time",
          "range": "width",
          "domain": {"data": "sp500", "field": "date"}
        },
        {
          "name": "yOverview",
          "type": "linear",
          "range": [70, 0],
          "domain": {"data": "sp500", "field": "price"},
          "nice": true, "zero": true
        }
      ],
      "axes": [
        {"orient": "bottom", "scale": "xOverview"}
      ],
      "marks": [
        {
          "type": "area",
          "interactive": false,
          "from": {"data": "sp500"},
          "encode": {
            "update": {
              "x": {"scale": "xOverview", "field": "date"},
              "y": {"scale": "yOverview", "field": "price"},
              "y2": {"scale": "yOverview", "value": 0},
              "fill": {"value": "steelblue"}
            }
          }
        },
        {
          "type": "rect",
          "name": "brush",
          "encode": {
            "enter": {
              "y": {"value": 0},
              "height": {"value": 70},
              "fill": {"value": "#333"},
              "fillOpacity": {"value": 0.2}
            },
            "update": {
              "x": {"signal": "brush[0]"},
              "x2": {"signal": "brush[1]"}
            }
          }
        },
        {
          "type": "rect",
          "interactive": false,
          "encode": {
            "enter": {
              "y": {"value": 0},
              "height": {"value": 70},
              "width": {"value": 1},
              "fill": {"value": "firebrick"}
            },
            "update": {
              "x": {"signal": "brush[0]"}
            }
          }
        },
        {
          "type": "rect",
          "interactive": false,
          "encode": {
            "enter": {
              "y": {"value": 0},
              "height": {"value": 70},
              "width": {"value": 1},
              "fill": {"value": "firebrick"}
            },
            "update": {
              "x": {"signal": "brush[1]"}
            }
          }
        }
      ]
    }
  ]
}
```
