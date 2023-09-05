## Table of contents with TOC {ignore=true}

The above header should not appear in TOC

[TOC]

## Table of contents with code chunk {ignore=true}

The above header should not appear in TOC

<!-- @import "[TOC]" {depthFrom:1, depthTo:6, orderedList:true} -->

<!-- code_chunk_output -->

<!-- /code_chunk_output -->

## Bash

`bash {cmd=true}`

```bash {cmd=true}
ls .
```

---

## JavaScript

`js {cmd=node output=html}`

```js {cmd=node output=html}
const date = Date.now();
console.log(date.toString());
```

---

`js {cmd=node output=markdown}`

```js {cmd=node output=markdown}
var greeting = 'Hello _world_';
console.log(greeting);
```

---

`js {cmd=node output=markdown output_first}`

```js {cmd=node output=markdown output_first}
var greeting = 'Hello _world_';
console.log(greeting);
```

---

`js {cmd=node output=none}`

```js {cmd=node output=none}
var greeting = 'Hello world!';
console.log(greeting);
```

---

`js {cmd=node output=txt modify_source}`

```js {cmd=node output=txt modify_source}
var greeting = 'Hello world!';
console.log(greeting);
```

---

`js {cmd=node output=txt modify_source run_on_save}`

```js {cmd=node output=txt modify_source run_on_save}
var greeting = 'Hello world!!!';
console.log(greeting);
```

---

## Python

`gnuplot {cmd=true output="html"}`

```gnuplot {cmd=true output="html"}
set terminal svg
set title "Simple Plots" font ",20"
set key left box
set samples 50
set style data points

plot [-10:10] sin(x),atan(x),cos(atan(x))
```

---

`python {cmd=true args=["-v"]}`

```python {cmd=true args=["-v"]}
print("Verbose will be printed first")
```

---

`python {hide=true}`

```python {hide=true}
print('you can see this output message, but not this code')
```

---

`python {cmd=true id="izdlk700"}`

```python {cmd=true id="izdlk700"}
x = 1
```

`python {cmd=true id="izdlkdim"}`

```python {cmd=true id="izdlkdim"}
x = 2
```

`python {cmd=true continue="izdlk700" id="izdlkhso"}`

```python {cmd=true continue="izdlk700" id="izdlkhso"}
print(x) # will print 1
```

---

`js {cmd=node output=text .line-numbers}`

```js {cmd=node output=text .line-numbers}
const date = Date.now();
console.log(date.toString());
```

---

## LaTeX

`latex {cmd=true}`

```latex {cmd=true}
\documentclass{standalone}
\begin{document}
   Hello world!
\end{document}
```

---

`latex {cmd latex_zoom=2}`

```latex {cmd latex_zoom=2}
\documentclass{standalone}
\begin{document}
   Hello world!
\end{document}
```

---

`erd {cmd=true output="html" args=["-i", "$input_file" "-f", "svg"]}`

```erd {cmd=true output="html" args=["-i", "$input_file" "-f", "svg"]}
[Person]
*name
height
weight
+birth_location_id

[Location]
*id
city
state
country

Person *--1 Location
```
