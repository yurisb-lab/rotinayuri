# Fontes da identidade

As duas famílias ficam no repositório em vez de virem de um CDN. O app é
offline-first e instalável: buscar fonte na rede faria o título piscar em
serifa do sistema toda vez que o aparelho estivesse sem internet.

| Arquivo                | Família           | Onde aparece                                   |
|------------------------|-------------------|------------------------------------------------|
| `fraunces-latin.woff2` | Fraunces          | Títulos, saudação do dia, resumo do dia         |
| `jakarta-latin.woff2`  | Plus Jakarta Sans | Todo o resto: listas, campos, botões, números   |

Ambas são variáveis (um arquivo cobre toda a faixa de peso) e recortadas no
subconjunto **latin**, que cobre o português inteiro — á, â, ã, ç, é, ê, í,
ó, ô, õ, ú. São ~95 KB somados, baixados uma vez e guardados pelo service
worker.

## Licença

As duas são **SIL Open Font License 1.1**, que permite uso, redistribuição e
embutir em produto, inclusive comercial:

- Fraunces — Undercase Type (https://fonts.google.com/specimen/Fraunces)
- Plus Jakarta Sans — Tokotype (https://fonts.google.com/specimen/Plus+Jakarta+Sans)

Texto da licença: https://openfontlicense.org

## Para atualizar

Baixe o `.woff2` do subconjunto latin em `fonts.gstatic.com` (o endereço sai
no CSS que a API `fonts.googleapis.com/css2` devolve) e substitua o arquivo
mantendo o mesmo nome. O `unicode-range` declarado em `css/base.css` precisa
continuar batendo com o subconjunto baixado.
