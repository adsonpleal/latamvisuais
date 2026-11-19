# Plano de extração — todos os servidores oficiais ativos

Status: **implementado** e testado ponta a ponta nas sete origens. 2026-11-17.
O que falta rodar de verdade é o estágio 1 completo (~85 MB, ~5 h) — ver §9.

O pipeline nasceu aqui e **mora no ragassets** desde então
(`tools/multiserver/` lá), onde já existiam o leitor de GRF, a VM de Lua, o
parser de patch-list e o leitor de BMP de que ele precisa — este repositório
carregava uma segunda cópia de cada um. Deste lado sobrou
`tools/sync-foreign-costumes.mjs`, que transforma o catálogo publicado no que o
app leva junto. Este documento descreve o pipeline; as seções abaixo que citam
caminhos são caminhos **no ragassets**.

Companheiro de [multi-server-visuals.md](multi-server-visuals.md), que
estabeleceu que os containers são legíveis e que view ids são consistentes. Este
documento é o plano de fazer a extração de verdade, em todos os servidores
oficiais que ainda rodam um patch service da Gravity.

Tudo marcado "verificado" foi rodado contra os hosts reais desta máquina em
2026-11-17. Ferramentas em [tools/explore/](../tools/explore/), dados em
[docs/data/](data/).

---

## TL;DR

1. **Seis origens vivas, todas alcançáveis do Brasil hoje**, com índice de patch
   no formato que já sabemos ler e `Range` aceito: kRO, kRO Zero, iRO, jRO, twRO,
   twRO Zero. Endpoints na §2 — verificados um por um.
2. **kRO não precisa de mirror.** O CDN oficial (`ropatch.gnjoy.com`) responde
   200 daqui; só o site institucional dá 403. O mirror da comunidade, 6 meses
   atrasado, deixa de ser dependência.
3. ~~**jRO destrava com uma linha.**~~ **Corrigido** (2026-11-17): seus `.gpf`
   são v0x103 e o `extract-grf.mjs` roteava para um leitor tirado da
   documentação do formato, que nenhum arquivo real usa. Agora a escolha de
   layout mora num `fileTableLayout()` só, 0x100–0x103 vão todos para `v1`, e o
   jRO extrai normal.
4. **twRO é a melhor origem agora**: ainda publica `.gpf` v0x102, patcheia toda
   semana e tem a tabela mais adiantada de todas (2.927 view ids, máximo 2947).
5. **View id continua a chave certa; nome de sprite não é global.** Com cinco
   clientes comparados, nenhum id aponta para duas fantasias diferentes — mas 2
   ids têm *nome de arquivo* diferente entre LATAM e jRO. Então `origin` importa
   na camada de assets/resolver, não na URL do `/image`.
6. **Ordem: indexar tudo (≈85 MB) antes de baixar qualquer coisa.** O índice é o
   artefato que decide o que baixar; sem ele a alternativa é baixar dezenas de GB
   por origem.

---

## 1. Quem está vivo, quem não está

O `doc/servers.txt` do bundle do RO Patcher Lite (4.11.1.1397, 2026-02-21) é a
segunda opinião mais confiável que existe, e corrige duas coisas do doc anterior:

- **GGH / SEA (`gnjoy.asia`) fechou em 31/07/2026.** O site responde 200 e tem
  notícia de Episode 17.2, mas o serviço acabou — era exatamente o "Server
  Closure Announcement 30/06/26" que a exploração anterior deixou em aberto.
- **bRO fechou em 30/07/2026** (não "substituído pelo LATAM": encerrado).

| Origem | Patch service | Observação |
|---|---|---|
| **kRO** | ✅ ativo | `.gsf` v0x300 desde 2025-12-04 |
| **kRO Zero** | ✅ ativo | ainda `.gpf` v0x102 |
| **iRO** | ✅ ativo | FTP anônimo listável |
| **jRO** | ✅ ativo | `.gpf` v0x103 + `.gsf` desde 2026-04-07 |
| **twRO** | ✅ ativo | `.gpf` v0x102, patch de hoje |
| **twRO Zero** | ✅ ativo | `.gpf` v0x102, desde 2025-06 |
| **LATAM** | ✅ (nossa) | já no pipeline |
| kRO Sakray Test | ❌ | índice para em 2021-11-17 |
| jRO Urdr | ❌ | índice para em 2003-10-23 |
| iRO Classic | ❌ | para em 2019 |
| GGH / SEA | ❌ | fechado 31/07/2026 |
| bRO | ❌ | fechado 30/07/2026 |
| **thRO** | ✅ ativo | `.gpf` v0x102, patch de ontem — **tinha índice e ninguém tinha olhado** (§10) |
| idRO GNJoy, vnRO VTC, ROPrime 4game (EU/RU), cRO Zhaouc | ⚠️ rodando, launcher próprio | sondados um por um em §11: idRO e ROPrime só distribuem instalador/launcher empacotado, vnRO está em manutenção, cRO publica um `.rar` de árvore de cliente com Range. O thRO estava nesta linha até 2026-11-19 |
| Ragnarok Zero Global (`roz.mygnjoy.com`) | ⛔ | lançado 2026-08-18; o 403 é **Cloudflare 1009, país BR banido pelo operador** (§11) |

O penúltimo grupo é o limite real do plano: sem índice de patch não há extração
remota, e um cliente completo teria que vir de instalador. Ficam fora, e o
divine-pride (§6) é a única evidência que teríamos sobre eles.

---

## 2. Endpoints — verificados 2026-11-17

Todos vieram do próprio bundle do RO Patcher Lite: os binários carregam a tabela
de **todos** os servidores (`CfgName`, `WebSite`, `WebPath`, `WebList`,
`FtpSite`), e `doc/rsu-ai-rag-lite.sample.ini` documenta o formato. Cada URL
abaixo foi confirmada com um GET no índice e um `Range: bytes=0-45` num arquivo.

| Origem | Índice | Store de arquivos | Último patch | Arquivos no índice |
|---|---|---|---|---|
| kRO | `https://ropatch.gnjoy.com/PatchInfo/patch2.txt` | `https://ropatch.gnjoy.com/Patch/` | 2026-11-04 | 984 GRF + 1.816 `.rgz`, desde 2020-02-25 |
| kRO Zero | `https://ropatch.gnjoy.com/Patchinfo_Zero/patch2.txt` | `https://ropatch.gnjoy.com/Patchfile_Zero/` | 2026-11-04 | 769 GRF + 1.283 `.rgz`, desde 2020-02-25 |
| iRO | `ftp://ropatch2.gravityus.com/patch/patchlist/patch3.txt` | `ftp://ropatch2.gravityus.com/patch/` | 2026-11-03 | 3.222 arquivos / 7,48 GB, desde 2011-07-29 |
| jRO | `http://httppatch.ragnarokonline.jp/patch30/patchbbs/patch2.txt` | `http://patch2.gungho.jp/pub/dl-gunghoftp/roftp/` | 2026-11-17 | 2.760 GRF + 788 `.rgz`, desde 2009-07-07 |
| twRO | `https://twcdn.gnjoy.com.tw/ragnarok/patchinfo/patch3.txt` | `https://twcdn.gnjoy.com.tw/ragnarok/patchfile/` | 2026-11-17 | 1.501 GRF + 2.636 `.rgz`, desde 2017-02 |
| twRO Zero | `https://rollive-patch.gnjoy.com.tw/patchinfo/patch.txt` | `https://rollive-patch.gnjoy.com.tw/patchfile/` | 2026-11-17 | 174 GRF + 364 `.rgz`, desde 2025-06-13 |
| LATAM | `https://ro1patch.gnjoylatam.com/LIVE/patchinfo/patch.txt` | `https://ro1patch.gnjoylatam.com/LIVE/patchfile/` | — | 917 sequências ativas |
| thRO | `https://ropatch.gnjoy.in.th/patchinfo/patch.txt` | `https://ropatch.gnjoy.in.th/patchfile/` | 2026-11-18 | 1.099 GRF + 2.214 `.rgz`, desde 2020-04-23 |

Detalhes que custaram tentativa:

- **Case importa.** kRO serve `/PatchInfo/` (índice) mas `/Patch/` (arquivos);
  `/Patchfile/` dá 403. O Zero inverte: `/Patchinfo_Zero/` e `/Patchfile_Zero/`.
  Os 403 são `AccessDenied` de S3 — prefixo errado, não geo-block.
- **kRO só guarda de 2020 em diante** no CDN oficial (índice começa na seq 4664,
  `2020-02-25data_true_001.gpf`). Para história completa (2002→) continua sendo o
  mirror `ro.archive.aotsw.com`, parado em 2026-05-20.
- **jRO separa índice e arquivos em hosts diferentes**: índice em
  `httppatch.ragnarokonline.jp`, arquivos em `patch2.gungho.jp`. Pedir o arquivo
  no host do índice dá 403.
- **iRO também responde em HTTP**:
  `http://patch1.playragnarok.com/patch02/patch3.txt` devolve 200. O FTP anônimo
  continua funcionando (226) e aceita `REST`, então não há motivo para trocar —
  mas é um fallback registrado.
- **Credenciais não.** O `sample.ini` do RSU publica usuário/senha de um FTP
  antigo da Gravity. Não usar: é histórico, as configs atuais vão com usuário
  vazio, e todos os endpoints acima são anônimos.

---

## 3. O que cada origem entrega, e o que trava

| Origem | Container atual | Lê hoje? | Trava |
|---|---|---|---|
| LATAM | `.gpf` v0x102 | ✅ | — |
| twRO | `.gpf` v0x102 | ✅ | — |
| twRO Zero | `.gpf` v0x102 | ✅ | — |
| kRO Zero | `.gpf` v0x102 | ✅ | — |
| iRO | `.gpf` v0x102 | ✅ | — |
| jRO | `.gpf` v0x103; `.gsf` v0x300 desde 2026-04-07 | ⚠️ | `.gpf` depois do fix (a); `.gsf` depende de (c) |
| kRO | `.gsf`/`.gef` v0x300 desde 2025-12-04 | ⚠️ | história ≤2025-12 lê; depois depende de (c) |

### Os quatro fixes no ragassets

**(a) v0x103 ia para o leitor errado — ✅ corrigido em 2026-11-17.**
`extract-grf.mjs` tinha um `readFileTableV103` separado, que assumia tabela sem
criptografia de nome. Os `.gpf` do jRO são v0x103 mas com layout **v1** (nome
cifrado por nibble-swap + DES, campos de tamanho deslocados). Resultado: lista
nomes em mojibake e extrai zero arquivos.

```
$ node extract-grf.mjs --list 2026-03-17main01.gpf
GRF version 0x103, 45 files, table at 0x5e7570
RSB&CrFÖ³CR"¦ÇEPEE	23689	flags=0x1
...

$ node tools/explore/grf-remote-list.mjs .../2026-03-17main01.gpf   # parser v1
magic="Master of Magic" version=0x103 count=45 table=3415B
data\carditemnametable.txt
data\LuaFiles514\Lua Files\Datainfo\accessoryid.lub
data\LuaFiles514\Lua Files\Datainfo\accname.lub
```

Como ficou: a escolha de layout virou uma função pura exportada,
`fileTableLayout(version)` → `v1 | v200 | v300 | null`, com 0x100–0x103 todos em
`v1`; o leitor da documentação foi removido (código morto com modelo errado é
pior que código nenhum, e o porquê está no comentário e aqui). Teste novo no
`extract-grf.test.mjs` fixa o mapa — 101 testes passando. Verificado contra o
`2026-03-17main01.gpf` do jRO: 45 entradas com nome e tamanho certos, as duas
`.lub` extraem e decifram, e a tabela resolve 2.805 view ids sem buraco. Isso
destravou **toda a história de `.gpf` do jRO — 2.692 arquivos desde 2009**.

**(b) `/image` mente sobre view id desconhecido.** Já descrito no doc anterior:
200 + corpo sem chapéu, byte a byte igual a uma request sem `headgear`. Enquanto
não tiver 404 (ou um header dizendo o que resolveu), qualquer medição de "isso
renderiza?" tem que comparar bytes com um baseline.

**(c) `flags = 0x80` no v0x300.** Bloqueia kRO depois de 2025-12-04 e jRO depois
de 2026-04-07 — ou seja, as duas origens upstream. O payload em `0x2e + offset`
não é deflate puro. Nota de campo nova: o próprio RO Patcher Lite anunciou em
2025-12-06 que o formato novo quebrou o `/testpak` dele, que só o patching
funciona, e **bloqueou esses patches por padrão** justamente para não corromper
dados de quem extrai arte. É um problema conhecido da comunidade, não uma
particularidade nossa — e é o único item do plano que é pesquisa, não trabalho.

**(d) Cosmético:** a contagem de arquivos do v0x300 usa a convenção de offset do
v1 e reporta número negativo em arquivos com poucas entradas.

Nada disso bloqueia o começo: com (a) e os containers v0x102, cinco das seis
origens estão abertas.

---

## 4. O que a comparação de cinco clientes decidiu

Snapshots: kRO 2025-10-15, LATAM 2026-07-23, iRO 2026-11-03, twRO 2026-11-10,
jRO 2026-03-17 (o último `.gpf` do jRO com as tabelas; depois só `.gsf`).

| Cliente | view ids | nomes distintos |
|---|---|---|
| kRO | 2.734 | 2.712 |
| jRO | 2.805 | 2.801 (4 sem nome) |
| LATAM | 2.859 | 2.837 |
| iRO | 2.916 | 2.892 |
| twRO | 2.927 | 2.903 |

```
kRO   vs LATAM   ids em ambos 2734   DIFERENTE 0
LATAM vs iRO     ids em ambos 2859   DIFERENTE 0
iRO   vs twRO    ids em ambos 2914   DIFERENTE 0
LATAM vs twRO    ids em ambos 2857   DIFERENTE 0    (2 ids do LATAM faltam no twRO)
LATAM vs jRO     ids em ambos 2800   DIFERENTE 3
```

**twRO** é quase um prefixo: os 70 ids que tem a mais são todos ≥2878 (acima do
máximo do LATAM, 2877), e os únicos ausentes são 2533 `_C_CLB_SS_LL` e 2564
`_C_Auspicloud` — dois buracos, não divergência.

**jRO é um galho, não um prefixo.** As três diferenças:

| view | LATAM | jRO |
|---|---|---|
| 880 | `_1` | *(vazio)* |
| 2007 | `_C_L_Knitting_Low_Twin` | `_C_Loose_Knitting_Low_Twin` |
| 2696 | `_C_CLB_DT_TS_Hood` | `_C_CLB_DT_TS_Manteau` |

880 é placeholder nos dois lados. As outras duas são **a mesma fantasia com nome
de arquivo diferente**. E o jRO define 2 ids que o LATAM não define:
1585 (`ACCESSORY_C_Cat_Ears_Cape_Red`, nome coreano) e 1862
`_C_Rudolf_Hairband` — **abaixo** do máximo do LATAM, ou seja o jRO preenche
buracos que as outras regiões deixaram vazios.

Consequências diretas para o desenho:

- **`/image?headgear=<view>` continua certo.** Em cinco clientes, nenhum view id
  aponta para duas fantasias diferentes. Não precisa de `origin=` na URL.
- **A tabela view→sprite é por origem.** Se extrairmos assets do jRO e
  resolvermos com a tabela do LATAM, os views 2007 e 2696 não acham arquivo. São
  2 em 2.800, mas falham em silêncio — exatamente o modo de falha que o `/image`
  já tem (b). Cada origem guarda sua `AccName` junto com os assets.
- **Nome de sprite segue sendo chave pior**: 19–21 nomes por cliente são usados
  por 2+ view ids.

---

## 5. O pipeline

Cinco estágios, cada um com saída própria e critério de parada. A ideia central:
**índice antes de download**. Uma tabela de entradas de GRF custa dois range
reads; baixar o arquivo errado custa megabytes.

### Estágio 1 — indexar todas as origens (sem baixar asset)

Rodar `grf-remote-list.mjs` sobre o índice inteiro de cada origem e gravar uma
linha por `(origem, seq, arquivo, caminho interno, tamanhos, flags)`.

Custo medido por amostra (bytes de tabela lidos): twRO 1,8 MB/120 patches
(~15 KB cada), jRO 0,5 MB/120 (~4 KB), kRO 0,1 MB/60 (~2 KB), LATAM 20,3 MB/569
(~36 KB). Extrapolando para os índices completos:

| Origem | Arquivos GRF | Estimativa |
|---|---|---|
| twRO | 1.501 | ~22 MB |
| jRO | 2.760 | ~12 MB |
| kRO | 984 | ~10 MB |
| kRO Zero | 769 | ~8 MB |
| twRO Zero | 174 | ~3 MB |
| iRO | ~3.200 | ~30 MB |
| **total** | **~9.400** | **~85 MB** |

A 1 req/s por host (dois reads por arquivo) são ~5 h de parede, paralelizável
entre hosts. É a parte mais barata do plano e a que torna todo o resto decidível.

Pendências deste estágio:

- **`.rgz` não dá range** (é gzip de arquivos soltos, sem tabela no fim). São
  7.000+ no total, e abrir um custa o download inteiro. Resolvido onde importa,
  não em geral: **o dado de item do twRO está exatamente aí**, e o estágio 2
  sonda os `.rgz` mais novos por `System/iteminfo_new.lub` quando a origem não
  tem os `.txt` — patch de cliente primeiro, `Raghash` e os 18 MB de `Ragexe`
  por último, com ledger (`rgz.tsv.probe`) para não abrir o mesmo duas vezes. O
  twRO acertou no primeiro, 2,6 MB. Varredura completa dos `.rgz` continua fora
  de escopo; se o estágio 3 mostrar buraco de **sprite**, é o próximo lugar a
  olhar.
- **iRO é FTP**: `REST` funciona, mas precisa de pool de conexão, não uma conexão
  por read.

**Saída:** `index/<origem>.tsv`, uma linha por caminho. Pronto quando todo
arquivo GRF de todo índice aparece exatamente uma vez — ou com motivo registrado
(bloqueado por v0x300, 404, pulled).

### Estágio 2 — catálogo por origem, direto dos arquivos do jogo

Do índice, pegar o patch mais recente de cada origem que carrega:

| Arquivo | O que dá |
|---|---|
| `datainfo/AccessoryId.lub` + `AccName.lub` | view id → nome do sprite |
| `datainfo/SpriteRobeId.lub` + `SpriteRobeName.lub` | **o segundo espaço de numeração**: view id de capa → pasta do sprite, em duas grafias (`RobeNameTable` dá o nome coreano, que é o `resourceName` do item; `RobeNameTable_Eng` dá o ASCII). Todo cliente publica os dois: `SpriteRobeName.lub` (os dados) e `SpriteRobeName_F.lub`, que **não** é variante regional — é o arquivo de funções (`ReqRobSprName`, `IsTopLayer`) que lê a tabela |
| `System/iteminfo_new.lub` | item id → **`ClassNum`, que É o view id** + nome exibido + nome do recurso, em um arquivo |
| `Lua Files/ItemDBNameTbl.lub` | item id → **AegisName** (`C_Kirin_Wing`), o identificador canônico do servidor. Não é nome de exibição, mas é a única string em inglês para uma fantasia que só tem nome em chinês ou japonês — e os sete clientes publicam, com os mesmos identificadores |
| `idnum2itemresnametable.txt` | item id → nome do recurso (clientes antigos) |
| `idnum2itemdisplaynametable.txt` | **item id → nome exibido, no idioma daquele servidor** (clientes antigos) |

O `iteminfo_new.lub` é a fonte moderna e torna o join exato: o cliente diz qual
view cada item desenha, em vez de a gente deduzir pelo nome do recurso. O par
`.txt` é o que os clientes antigos traziam, e onde os dois existem o `.txt` ainda
preenche lacunas. **O twRO já não traz os `.txt`**: um grep nos 2.833 arquivos
indexados dele não acha nenhum dos dois — o dado de item chega como
`System/iteminfo_new.lub` dentro de um `.rgz` (ver o estágio 1).

Esses arquivos juntos fecham o join `item ↔ view id ↔ nome` por origem, sem
depender de nenhuma fonte externa. É também a resposta ao problema de nomes que o
doc anterior deixou aberto: os 1.054 views renderizáveis sem nome pt-BR passam a
ter nome em inglês (iRO), japonês (jRO), chinês tradicional (twRO) e coreano
(kRO), vindo do cliente de cada região.

Verificado: os dois `.txt` aparecem nos patches do jRO que listei, e as duas
`.lub` saíram limpas de twRO (v0x102) e jRO (v0x103, via fix (a)).

**Saída:** `catalog/<origem>/{views.tsv,items.tsv,names.tsv}`. Pronto quando as
cinco origens abertas resolvem 100% dos ids para um nome de sprite — o mesmo
critério que os cinco clientes já bateram nesta exploração.

### Estágio 3 — decidir o que realmente falta

União de todas as tabelas view→sprite × o que o nosso mirror desenha hoje (probe
por bytes, §(b)). Saída: a shortlist `(view id, sprite, origens que têm, LATAM
desenha?)`.

Expectativa pelos números de hoje: a faixa 2500+ (16/282 renderizáveis no LATAM)
mais os exclusivos de twRO (70 ids ≥2878) e jRO (2 ids). Ordem de 300–400 views,
não 1.700 — e **nenhuma extração é necessária para os 1.054 que o LATAM já
desenha**, que continuam sendo o primeiro release.

### Estágio 4 — baixar e extrair só a shortlist

Para cada view da shortlist, achar no índice o arquivo mais recente de cada
origem que contém `sprite\악세사리\<nome>*` (e `로브\` para capas, `이팩트\` para
asas/efeitos), baixar esses arquivos e sobrepor em ordem de sequência (patch mais
novo ganha) numa árvore **por origem**:

```
mirror-<origem>/data/sprite/악세사리/...
```

Verificado que arte vem mesmo em `.gpf`, e com frequência: **9 dos 40 patches
mais recentes do twRO** contêm árvore de sprite. O formato dos caminhos, lido
direto das tabelas:

```
data\sprite\악세사리\남\남_C_Chained_Bear.{act,spr}          # chapéu, por sexo
data\sprite\악세사리\남\남_C_Halloween_Candypouch.{act,spr}
data\sprite\로브\C_S_Thanatos_Wing\C_S_Thanatos_Wing.spr    # capa
data\sprite\로브\C_S_Thanatos_Wing\C_S_Thanatos_Wing_doram.spr
data\sprite\로브\C_S_Thanatos_Wing\남\abyss_chaser_riding_남.act
```

Ou seja: chapéu é `악세사리\<sexo>\<sexo>_<nome do AccName>.{act,spr}`, e capa é
`로브\<nome>\` com variante doram e um `.act` por classe/montaria. O match do
estágio 4 é por **nome do sprite vindo do estágio 2**, não por view id — e a
subárvore de capa de um único visual já traz dezenas de `.act`, o que é o que
infla o download. Então a shortlist deve resolver em dezenas de arquivos de
patch por origem, não em centenas.

Filtro de extração, igual ao que o ragassets já usa para o LATAM:
`data\(sprite|palette|imf|luafiles514)\`, mais `data/texture/유저인터페이스/`
(ícones e ilustrações de coleção) e `data/texture/effect/` (os `.str` dos efeitos
de chapéu).

**Nunca mesclar numa árvore só.** Os views 2007/2696 provam que o mesmo id tem
nome de arquivo diferente por servidor; e `--prune-robes` e a tabela de tom de
pele são assadas por sprite, então rodam por árvore.

#### O slot do item não tem campo — está na descrição

Procurando por onde ordenar o download, apareceu um buraco de produto. A tabela
de item do cliente **não tem campo de posição de equipamento**. A posição está
escrita no *texto da descrição*, como uma linha etiquetada no idioma daquele
servidor, e o ragassets lê só a forma portuguesa (`"Equipa em: Topo e Meio"`) —
então toda fantasia estrangeira vinha sem slot nenhum. Sem slot o app não sabe
onde mostrar a fantasia, então isso bloquearia a exibição, não só a ordem.

As etiquetas e valores foram colhidos das tabelas em disco:

| | etiqueta | valores |
|---|---|---|
| pt | `Posição :` / `Equipa em :` | `Topo` `Meio` `Baixo` `Capa`, unidos por "e" ou "," |
| zh | `位置 :` | `頭上` `頭中` `頭下` (cabeça alto/meio/baixo), `披肩` (capa de ombro) |

O chinês une com `/`, `、` ou nada (`頭上中下`), e às vezes encosta no campo
seguinte sem separador (`頭上重量: 0`) — então o parser procura 上/中/下 dentro de
um valor prefixado por 頭, em vez de casar palavras inteiras.

Só três origens publicam um `iteminfo_new.lub` legível (LATAM, twRO, twRO Zero);
o par `.txt` legado do jRO não traz descrição, e kRO/kRO Zero/iRO não publicam
tabela moderna alcançável. Mas id de item é global, então essas três nomeiam
**2.753 pares (kind, view)** — 1.399 topo, 459 meio, 635 baixo, 260 capa, muito
além das fantasias que elas próprias oferecem.

Onde dois clientes discordam (236 pares discordam), ganha a fonte mais antiga na
ordem das origens, LATAM primeiro: o LATAM é o servidor que o app simula, então
onde ele define uma view é ele a autoridade sobre aquela view. Essa ordem leva a
concordância com o db do app de 1.227/1.239 para **1.231/1.239** — as 5 que ainda
diferem são views em que o app e este índice escolhem *itens diferentes*, e os
dois itens carregam conjuntos de slot genuinamente diferentes.

Vale registrar o que isso revelou do LATAM, e vale registrar com cuidado porque
o primeiro número assusta mais do que deve. No cliente LATAM, **313 das 1.389
views de fantasia não têm nenhum item que escreva linha de posição**, e 308
dessas não estão no db do app — o ragassets descarta item sem slot, e de fato
todos os 1.261 itens do db têm slot. Mas 305 dessas views só têm itens **sem
nome** (placeholder do cliente), que o app descartaria de qualquer jeito. A
lacuna real é de **3 views**: 305 "Peruca do Visual Carnavalesco", 354 "Kafra
V.I.P." e 249 "[Visual] Coelho Caído". Pequeno, mas são fantasias nomeadas que o
cliente LATAM tem e o app não mostra.

#### Medido (2026-11-18) — e o estágio 4 virou dois

A previsão acima errou em dois pontos, os dois para mais caro.

**Buscar por origem baixa a mesma fantasia até seis vezes.** Um sprite quase
sempre está no histórico de várias origens. Somando os arquivos que cada origem
precisaria, dá **789 patches**; um conjunto só que cobre todas as views
alcançáveis dá **192**. Então entrou um `plan`: uma cobertura de conjuntos
gulosa sobre pares `(origem, arquivo)`, escrita em `plan.tsv` para revisão antes
de gastar banda de ninguém.

**Um patch não é um sprite.** Os patches de cliente do twRO vão de 2 a 292 MB
(mediana 2,8, média 60 na amostra em disco) e o sprite dentro tem algumas
centenas de KB. Mas uma entrada de GRF carrega o próprio offset e o próprio
tamanho comprimido — então dá para ler só os bytes dela por range request, o que
é o que o `fetch` faz. Baixar os 192 patches inteiros seria da ordem de **11 GB**
pela média.

O custo real das 825 views de fantasia que faltam:

| | views | arquivos | bytes (descomprimidos) |
|---|---|---|---|
| `acc` — chapéu | 571 | 2.253 | 190 MB |
| `robe` — capa | 161 | 33.245 | 1.809 MB |
| inalcançáveis | 93 | — | — |

A previsão de que a subárvore de capa é o que infla estava certa, e por muito:
capa é **95% do custo**, ~207 arquivos por view, e a view 325 sozinha são 710
arquivos e 468 MB. Chapéu são dois arquivos. Por isso o `plan` tem `--tiers`:
separa os arquivos da própria fantasia (`core`) da pasta de aura que alguns
chapéus carregam (`effect`, só 1,2 MB na prática), e dá para começar pela metade
barata.

**Histórico de patches não é um cliente.** As 93 views inalcançáveis são os
chapéus mais antigos do jogo — `_두건` (capuz), `_머리띠` (fita), `_햇`
(chapéu). Estão no `data.grf` do instalador desde 2002 e nunca foram
re-patcheados. O índice reproduz só o que foi distribuído como patch; para o
resto, o instalador é a única fonte.

Por slot, os mesmos 1.906 MB se dividem em: topo 94 MB, meio 15 MB, baixo
30 MB, capa 1.100 MB, e 667 MB de views que nenhum cliente nomeia slot (as que
só iRO, kRO ou jRO definem). O plano é ordenado por slot, não por sequência de
patch — uma corrida completa leva horas e pode ser interrompida, então o que
mais importa cai primeiro. A ordem é de graça: `resolveOrigin` guarda um arquivo
por caminho, `coverPlan` põe cada caminho num passo só, e cada origem espelha na
própria árvore, então dois passos nunca escrevem o mesmo arquivo.

Validado ponta a ponta num patch pequeno do iRO: 4 arquivos escritos em **3
requisições** (duas da tabela, uma da faixa unida) e menos de 0,1 MB. Os bytes
decodificam com os parsers do ragassets — 5 quadros 27×20, 104 ações.

**A armadilha que a corrida completa encontrou:** a tabela de um GRF lista
**diretórios** junto com os arquivos, distinguidos só pelo bit 0x01, e o índice
do estágio 1 carregou os dois. Uma entrada de diretório decodifica para zero
bytes — então o fetch escrevia um arquivo vazio no caminho da pasta, e a
primeira entrada real embaixo dela morria com `EEXIST`. Matou o twRO e o twRO
Zero depois de ~650 arquivos cada. Duas correções: filtrar pelo bit antes de
montar qualquer faixa (`fileEntries`, com teste), e nunca escrever payload
vazio, porque sprite vazio não existe. Uma terceira, de robustez: uma falha de
escrita isolada agora é contada e pulada, não fatal — uma corrida de horas não
pode morrer num caminho que o sistema de arquivos recusa.

#### A primeira corrida completa (2026-11-18)

O `fetch` rodou nas seis origens, agrupadas por host em cinco processos:

| origem | arquivos | patches | requisições | transferido |
|---|---|---|---|---|
| iRO | 11.438 | 65 | 159 | 93,7 MB |
| twRO | 4.680 | 26 | 39 | 93,8 MB |
| twRO Zero | 3.660 | 10 | 31 | 37,4 MB |
| jRO | 0 | 51 | 26 | 0,2 MB |
| kRO | 0 | 27 | 20 | 0,3 MB |
| kRO Zero | 0 | 13 | 0 | 0,0 MB |

**275 requisições para 23.686 arquivos** — a união de faixas fez quase todo o
trabalho, e 225 MB transferidos contra os ~11 GB que seria baixar os patches.

Cobertura real, que é o número que importa: **523 das 732 views prometidas
completas, zero parciais** (ou a view vem inteira ou não vem — chapéu com um
sexo só não desenha). As 209 que falharam eram todas de jRO (156) e kRO (53).

#### O planejador estava escolhendo arquivo que não abre

Todas as 209 perdas foram para arquivos v0x300. O ledger do estágio 1 **já
marca** esses arquivos como `blocked` — 141 no kRO, 68 no jRO — mas o
planejador escolhia a cópia mais recente de cada caminho sem olhar se dava para
ler. Treze dos 51 patches jRO do plano eram bloqueados.

Com `blockedFrom()` filtrando o ledger, o plano cai para **665 views** e as
inalcançáveis sobem de 93 para 160. Isso parece pior e é melhor: 67 daquelas 732
só existiam em arquivo bloqueado, então a contagem antiga era ficção. As 665
agora são todas legíveis, contra as 523 que de fato chegaram.

O custo sobe para **3.042 MB** porque as capas que iam para jRO/kRO foram
reatribuídas a origens legíveis, cujas pastas são maiores — capa 2.261 MB dos
3.042. A lição é que a cobertura de conjuntos otimiza o que você mede: medindo
"arquivos que existem no índice", ela escolhe arquivos que não abrem.

#### Resultado final (2026-11-18)

Com o plano corrigido, a segunda corrida fechou a conta:

| | requisições | transferido | arquivos escritos |
|---|---|---|---|
| 1ª corrida (plano com arquivo bloqueado) | 275 | 225 MB | 23.686 |
| 2ª corrida (plano corrigido) | 224 | 352 MB | 47.303 |
| **total** | **499** | **577 MB** | **70.989 no espelho** |

**665 das 665 views do plano completas. Zero parciais, zero faltando.** Por
slot: 164 topo, 71 meio, 118 baixo, 111 capa, 201 sem slot conhecido (as que só
iRO, kRO ou jRO definem).

Das 825 views de fantasia que faltavam ao app, **665 foram obtidas** e 160
continuam inalcançáveis: ou só no `data.grf` do instalador, ou só em arquivo
v0x300 (o fix (c), ainda aberto).

Espelho: 3,3 GB em 70.989 arquivos, em sete árvores por origem. Estado total em
disco: 4,8 GB.

Verificação: 840 arquivos amostrados nas sete origens (espaçados por todo o
alcance, não os primeiros), todos decodificam com `decodeSprFrames` e
`parseActFrames` do ragassets, **zero falha e zero arquivo de zero byte**.

Para comparar com a estimativa original do plano: 577 MB transferidos contra
"poucos GB de patches baixados", e 499 requisições para 70 mil arquivos — a
leitura por faixa com união de spans é o que fez a diferença, não a largura de
banda.

### Estágio 5 — derivar e publicar

Por origem, na ordem que o ragassets já tem: `--prune-robes` + `--robe-index`,
`gen-skin-table`, `--icons`, `--illust`, `--effects`. Depois o resolver por origem
(a tabela do estágio 2, não a do LATAM) e a publicação com a dimensão `origin`.

#### Uma árvore por origem, e isso foi medido (2026-11-18)

A primeira pergunta do estágio 5 é se as sete árvores podem virar uma. Dos
68.197 caminhos distintos, só 2.792 aparecem em mais de uma árvore, e **286
deles têm conteúdo diferente entre origens** — 282 `.act` (offsets de animação) e
4 `.spr` (a arte em si), concentrados em 4 fantasias. Ou seja: fundir corromperia
essas 4 e economizaria quase nada, porque a sobreposição é 4% dos caminhos.

Então cada fantasia carrega a origem cuja árvore tem os arquivos dela, e
`origin` entra na tabela view→nome, não no nome do arquivo.

E a view id **não é chave global**: o gateway resolve id de chapéu → nome de
sprite por uma tabela tirada do cliente LATAM, e uma view estrangeira pode não
estar lá ou apontar para outro nome (2007 e 2696 apontam). Por isso o catálogo
carrega o nome do sprite explícito, e quem consome resolve por nome — nunca
reproduzindo uma view estrangeira na tabela do LATAM.

#### O `--prune-robes` não achava nada, e o motivo era o limiar

O ragassets apaga de propósito os sprites de mochila-de-aventureiro que a
Gravity deixa em toda pasta de capa que copia. Rodando contra o espelho, não
achou nada. Causa: `ROBE_TEMPLATE_MIN_FOLDERS = 10` é **absoluto**, e o espelho
tem subconjunto de pastas por origem — com 9 pastas o detector desiste em
silêncio.

Antes de mexer no limiar, validei os 8 hashes candidatos contra a árvore de
produção já podada: **8 de 8 ausentes**, ou seja todos são sobra real, nenhum é
arte legítima. Daí o `--min-folders N` novo (com validação, teste e CHANGELOG no
ragassets), que podou 1.119 arquivos de 9 pastas do LATAM.

#### O estágio 5 achou um bug no planejador — 31% dos arquivos de capa

A regra de "essa fantasia desenha?" errou duas vezes antes de acertar, e a
terceira revelou o bug de verdade.

Tentativa 1, "todos os caminhos do plano existem": exclui as 9 capas do LATAM
que o `--prune-robes` acabou de podar. Um plano é uma **ordem de entrega, não um
inventário**. Tentativa 2, "tem um `.spr` entre os caminhos do plano": exclui
capas cujo conjunto planejado não tem `.spr` nenhum. Tentativa 3, perguntar à
**árvore** o que cada tipo precisa para desenhar — chapéu, os dois `.spr` de
sexo; capa, pelo menos um `.spr` em qualquer lugar da pasta.

Com a regra certa, 31 das 665 fantasias não desenhavam. E o diagnóstico separou
dois veredictos bem diferentes:

- **29 com o `.spr` no índice da própria origem** — falha do plano, dá para buscar.
- **2 com o `.spr` em patch nenhum** — indisponíveis de verdade (iRO
  `robe:132 C_2022RTC_V_Coat4` e `robe:94 C_Rotating_Gears`).

O bug: o `coverPlan` contava cobertura **por view**, então a view saía da lista
de pendentes no instante em que um arquivo escolhido entregava *parte* dela. E a
Gravity publica os `.act` de uma capa num patch e o `.spr` dela em outro com
frequência suficiente para isso doer: 27 pastas de capa chegaram como dado de
animação sem arte nenhuma, e 2 chapéus do kRO Zero chegaram com um sexo só. O
plano se lia completo enquanto o espelho não desenhava.

A correção conta cobertura **por caminho**, mantendo cada fantasia numa única
origem (os 282 `.act` divergentes são exatamente o motivo: metade twRO + metade
iRO animaria contra os offsets errados). Custo: 25 patches a mais e 30.048 arquivos
a mais — o plano antigo estava **perdendo 31% dos arquivos de capa que
precisava**.

| | antes | depois |
|---|---|---|
| patches | 190 | 215 |
| arquivos no plano | 67.469 | 97.545 |
| MB descomprimidos | 3.042 | 4.261 |
| arquivos de capa | 65.451 | 95.499 |
| views cobertas | 665 | 665 |

E depois do `originCanDraw`, o plano final: **663 views em 215 patches, 97.537
arquivos, 4.260 MB**, com 162 inalcançáveis — as 160 de antes mais as 2 que
nenhuma origem desenha.

A cobertura de views não mudou, e é esse o ponto: o número que eu estava
olhando não media o que eu achava que media.

#### E o "indisponível" também estava errado em 2 de 4

O diagnóstico que separou "falha do plano" de "indisponível" só procurou na
origem que o plano **tinha escolhido**. Procurando nas sete:

| view | escolhida | realidade |
|---|---|---|
| `robe:132 C_2022RTC_V_Coat4` | iRO (sem `.spr`) | **twRO tem 343** |
| `acc:1931 _C_Dullahan_Mask` | kRO Zero (1 sexo) | **twRO tem os dois** |
| `acc:156 _인큐버스뿔` | kRO Zero (1 sexo) | só o kRO Zero, 1 sexo — metade de verdade |
| `robe:94 C_Rotating_Gears` | iRO | em índice de origem nenhuma — sumiu mesmo |

Ou seja: o guloso escolhe a origem por **quantidade** de arquivo, que não é o
mesmo que entregar os arquivos **certos**. O `originCanDraw` novo aplica no
planejador exatamente o teste que o estágio 5 aplica na árvore (chapéu, os dois
sexos; capa, um `.spr` na pasta), e uma origem que não consegue desenhar a view
nem compete por ela. View que nenhuma origem desenha sai como inalcançável
**antes** de gastar byte, em vez de virar fantasia que o catálogo descarta
depois de baixada.

Esse é o padrão que se repetiu três vezes nesse estágio: **a métrica que eu
estava olhando (views cobertas) não media o que eu precisava saber (views que
desenham)**. Cada vez que aproximei as duas, apareceu trabalho real escondido.

#### Resultado do estágio 5 (2026-11-18)

Plano final: **663 views, 215 patches, 97.537 arquivos, 4.260 MB**. Conferido
linha por linha contra o espelho: **97.537 de 97.537 presentes, 663 de 663 views
completas, zero parcial**. O `fetch` fechou em 0 requisição na segunda passada,
ou seja nada ficou para trás.

Catálogo (`foreign-costumes.json`): **663 fantasias completas, zero descartada** —
antes eram 634 de 665, com 31 fora. Plano e catálogo agora concordam exatamente,
que era o invariante que faltava: o teste de "desenha?" do planejador é o mesmo
teste que o catálogo aplica na árvore.

| | fantasias |
|---|---|
| nomeadas | 600 |
| com identificador inglês (`aegis`) | 188 |
| por origem | iRO 231, jRO 119, kRO Zero 113, LATAM 71, twRO 64, twRO Zero 38, kRO 27 |
| por slot | topo 163, baixo 132, capa 111, meio 87, sem slot 200 |

Verificação: 1.069 arquivos amostrados nas sete origens (espaçados por todo o
alcance), 405 `.spr` por `decodeSprFrames` e 664 `.act` por `parseActFrames` —
**zero falha, zero arquivo de zero byte**, e todo quadro de sprite com pixel de
verdade.

O espelho tem 114.169 arquivos (4,67 GB) para 97.537 que o plano atual
referencia: os 16.632 restantes são sobra dos planos antigos (a arte que o
`robe:132` tinha trazido do iRO, por exemplo). Não incomodam ninguém — cada
origem tem sua árvore e o catálogo só aponta para o que o plano atual pede — mas
dá para limpar se o espaço importar.

#### Um contador que quase me fez concluir errado

A primeira corrida com o plano corrigido reportou 8.266 escritos + 74.949 já no
espelho + 18 ausentes = 83.233, contra 97.537 planejados. Parece dado perdido;
não era. O `stats.skipped` só era preenchido quando o arquivo inteiro já estava
no espelho — patch parcialmente espelhado contribuía zero. Corrigido, a segunda
passada fecha em 97.537 exatos. Vale registrar porque eu ia reportar esse número
como se fosse buraco de dado.

### Atualização

Já está decidido que isso **não precisa ficar em sync** como o LATAM. Então:
rodada manual, local, e o estágio 1 é incremental de graça (o índice guarda a
última seq vista por origem). Para referência de ritmo: twRO, twRO Zero e jRO
patchearam hoje; kRO e iRO, em 4 e 3 de novembro.

---

## 6. Conferência com o divine-pride

Cruzar com `divine-pride.net/database/item/costume`, que tem chips de servidor
por item, entra como **conferência de cobertura, não como fonte**: se está nos
arquivos do jogo, fica, independente do que o site diga.

O que o site oferece, inspecionado hoje:

- **2.230 itens de fantasia**, 20 por página, 112 páginas (`?page=N`). Cada linha
  tem id do item, nome, tipo, subtipo e uma coluna **Server** com os chips.
- **19 regiões** no seletor: `bRO`, `cRO`, `cROZ`, `dpRO`, `GGHRO`, `GZero`,
  `iRO` (+ `iROT` nos chips), `idRO`, `jRO`, `kROM`, `kROZ`, `LATAM`, `ropEU`,
  `ropRU`, `thROC`, `thROG`, `twRO`, `twRO zero`. Inclui justamente as que não
  têm endpoint (thRO, idRO, cRO, ROPrime) — para essas o chip é a única evidência
  que existiria, e como o site não é autoritativo, **chip sozinho não cria
  entrada no catálogo**: entra como "possivelmente existe, não verificado".
- A região é preferência de sessão (POST + reload, cookie) e muda o idioma dos
  nomes. Um crawl por região daria nome por servidor — redundante com o estágio
  2, que tira isso do próprio cliente.
- A página do item tem preview de personagem com `accessorySprite`, que seria o
  join perfeito para view id — mas vem `null` em boa parte dos itens na região
  padrão (`dpRO`). Join confiável é pelo **id do item** contra
  `idnum2itemresnametable.txt` do estágio 2.
- Existe API própria (`api.divine-pride.net`) com chave gratuita; é o caminho
  limpo para 2.230 itens, em vez de raspar 112 páginas + 2.230 detalhes.
  **Precisa você criar a chave.**

Uso previsto, no fim do estágio 3: comparar o conjunto `(item, servidores)` do
site com a nossa shortlist e produzir três listas — (i) está nos arquivos e no
site: ok; (ii) está nos arquivos e não no site: fica, e o site está incompleto;
(iii) está no site e não nos arquivos: investigar, e se for de servidor sem
endpoint, registrar como não verificável.

---

## 7. Orçamento, riscos e limites

**Custo de rede — medido, não estimado.** Estágio 1 custou **147,2 MB** em
12.299 arquivos (a estimativa era ~85 MB; 12 KB por arquivo de tabela, não 9).
Estágio 4, pelo `plan` das 825 views de fantasia que faltam: **192 patches**, e
como o `fetch` lê só a faixa de bytes de cada entrada, **1,9 GB descomprimidos**
em vez dos ~11 GB que seria baixar os patches inteiros. Desses 1,9 GB, 190 MB
são os 571 chapéus e 1,8 GB são as 161 capas — dá para fazer a metade barata
primeiro.

**Etiqueta.** 1 req/s por host, User-Agent honesto, sem credencial nenhuma, cada
download no seu próprio diretório vazio (dado não confiável). Os índices são
públicos e anônimos; nada aqui contorna autenticação ou região — os seis
endpoints responderam do Brasil sem truque.

**Riscos:**

1. **v0x300 sem solução** (fix c) congela kRO em 2025-12-04 e jRO em 2026-04-07.
   Mitigação: twRO e iRO publicam o mesmo upstream em v0x102, e twRO está na
   frente de todos em view ids — dá para seguir sem kRO.
2. **Geo-block futuro.** O site do kRO já dá 403 daqui; o CDN, não. Se mudar, o
   mirror da comunidade volta a ser plano B (atrasado, mas íntegro).
3. **Nome de arquivo divergente por origem** (2007, 2696 hoje). Mitigação: tabela
   por origem, e um check no estágio 5 que falha se um view da shortlist não
   achar arquivo na árvore da própria origem.
4. **Idioma.** Nome vindo de iRO/jRO/twRO/kRO não é pt-BR. Decisão de produto
   pendente: nome original com a badge da origem, ou tradução. "1.054 entradas
   sem nome" não é feature, e "1.054 entradas em japonês" também não.
5. **`.rgz` não indexável por range** (7.000+). Já não é risco para dado de
   item — a sonda dirigida do estágio 2 alcança o `iteminfo_new.lub` do twRO —
   mas pode esconder atualização de **sprite**; ver estágio 1.
6. **Posição jurídica** não muda: são assets da Gravity, do mesmo tipo que já
   servimos do LATAM. Vale checar se "fantasia que não existe no LATAM" muda algo
   nessa leitura antes de publicar.

---

## 8. Ordem recomendada

1. ✅ **Fix (a)** — rotear v0x103 para o leitor v1. Feito.
2. **Fix (b)** — `/image` 404 para view desconhecido, ou header de resolução.
3. **Estágio 1** nas cinco origens abertas (marcar kRO ≥2025-12 e jRO ≥2026-04
   como bloqueados, em vez de pular em silêncio).
4. **Estágio 2** — catálogo + nomes por origem. É aqui que o problema de nome do
   release 1 se resolve, mesmo sem nenhum asset novo.
5. **Estágio 3** — shortlist, e só então decidir se vale o estágio 4.
6. **Conferência divine-pride** (§6), depois da shortlist, para medir cobertura.
7. **Estágios 4 e 5** por origem, começando por **twRO** (v0x102, mais
   adiantada, patch semanal), depois iRO, jRO, kRO Zero, twRO Zero.
8. **Fix (c)** — v0x300 — só quando kRO for de fato necessário.

---

## 9. Estado da implementação

O pipeline existe em `tools/multiserver/` **no ragassets**, com README de
operação. Um CLI, seis estágios, estado fora do repo (`MULTISERVER_DIR`, default
`~/ro-multiserver`). Na mudança para lá, `grf.mjs` perdeu a metade que lia
archives do disco, `lua51.mjs` e `extractor.mjs` sumiram inteiros, e o leitor de
patch-list virou o mesmo que o ciclo de patch do LATAM usa.

| Arquivo | O quê |
|---|---|
| `origins.mjs` | as sete origens com endpoint, encoding e o parser de índice |
| `net.mjs` | range reads HTTP e FTP, 1 req/s por host, retry, download retomável |
| `extractor.mjs` | o único ponto que carrega o `extract-grf.mjs` do ragassets (parser v1, VM Lua, leitor `.rgz`, decodificador de charset) |
| `grf.mjs` | tabela remota v1/v0x200/v0x300, reusando o `parseFileTableV1` do ragassets |
| `lua51.mjs`, `lubtables.mjs` | as `.lub` sem Lua 32-bit + as tabelas `#`-delimitadas de item |
| `iteminfo.mjs` | o `System/iteminfo_new.lub`: item → `ClassNum` (view id no espaço dele), nome e recurso |
| `rgzprobe.mjs` | sonda dirigida nos `.rgz`, que não têm tabela para range read |
| `coverage.mjs` | a regra que decide se vale gastar banda sondando `.rgz` |
| `stage1-index.mjs` … `stage4-assets.mjs` | os quatro estágios |
| `store.mjs`, `seed.mjs`, `cli.mjs` | layout em disco, atalho de catálogo, CLI |

### Testado ponta a ponta (2026-11-17)

- **Estágio 1** nas **sete** origens. Amostra de 6 arquivos cada: iRO por FTP
  inclusive. v0x300 do kRO e do jRO registrados como `blocked`, `.rgz` como
  `rgz`, zero erros. Depois, 250 arquivos do twRO e 170 do jRO: `0,9 MB` de
  tabela para 47.646 caminhos do jRO — ou seja a extrapolação de ~85 MB para os
  ~9.400 arquivos continua de pé.
- **Estágio 2** no twRO (v0x102) e no jRO (v0x103, via o fix): 2.927 e 2.805
  view ids, idênticos aos que a exploração tirou à mão.
  - **jRO**, pelo par `.txt`: 14.829 nomes de recurso, 13.914 nomes exibidos, e
    o join por sublinhado casou **2.257 views com item, 2.184 com nome em
    japonês**.
  - **twRO**, pelo `iteminfo_new.lub` achado dentro de um `.rgz`: 21.318 nomes
    de recurso, 21.207 nomes exibidos, 5.735 itens com view id. O join casou
    **2.432 views, 2.339 deles pelo `ClassNum` do próprio cliente** e só 93 pela
    convenção do sublinhado — **2.426 com nome em chinês**. Os outros 6 o próprio
    twRO não nomeou: o cliente traz a string literal `(null)`, em 94 itens no
    total, e o leitor a descarta em vez de passar isso adiante como nome.
- **Estágio 2 no LATAM**, que é onde existe gabarito: 2.859 views de chapéu e
  **330 de capa**; 18.060 nomes de recurso e 14.997 nomes exibidos, do
  `iteminfo_new.lub` achado num `.rgz` de 5,7 MB. O join casou **1.984/2.859
  chapéus (1.461 nomeados)** e **185/330 capas (153 nomeadas)**.
- **Estágio 1 completo nas sete origens** (2026-11-17, ~2h30 de relógio):

  | origem | arquivos | legíveis | `.rgz` | bloqueados | caminhos | tabela lida |
  |---|---|---|---|---|---|---|
  | LATAM | 917 | 569 | 348 | 0 | 246.314 | 20,3 MB |
  | iRO | 1.837 | 1.199 | 638 | 0 | 362.828 | 28,9 MB |
  | kRO | 1.639 | 814 | 684 | **141** | 209.016 | 14,5 MB |
  | kRO Zero | 1.322 | 762 | 560 | 0 | 223.374 | 17,4 MB |
  | twRO | 2.833 | 1.436 | 1.397 | 0 | 464.569 | 36,9 MB |
  | twRO Zero | 311 | 174 | 137 | 0 | 67.309 | 5,3 MB |
  | jRO | 3.440 | 2.639 | 733 | **68** | 341.512 | 23,9 MB |
  | **total** | **12.299** | 7.593 | 4.497 | **209** | **1.914.922** | **147,2 MB** |

  Contra a estimativa do §5 (~85 MB para ~9.400 arquivos): **12 KB por arquivo
  em vez de 9 KB, e 2.900 arquivos a mais do que eu tinha contado** — ordem de
  grandeza certa, total 73% acima. O índice ocupa 203 MB em disco. **Zero erros**,
  iRO por FTP inclusive, nas 1.831 leituras dele. Só kRO e jRO têm arquivo
  bloqueado, e são 209 de 12.299 (1,7%).

  O relógio só fechou em 2h30 em vez das ~5h porque os sete rodaram em cinco
  processos, um por grupo de host — o limite de 1 req/s é por host, e
  `--origin all` o aplica em série. Ver o README.
- **Estágio 2 no kRO**: 2.734 views de chapéu e 288 de capa, mas só **553
  nomeados**. O par `.txt` dele é antigo (7.170 itens) e o `iteminfo_new.lub`
  não está em `.rgz` (12 sondados, ~30 MB, nada) — ou seja, **a tabela de item
  atual do kRO está dentro dos v0x300 bloqueados**. É o fix (c) bloqueando nome,
  não só asset. Como nome do kRO é coreano, o valor dele aqui é cobertura, e
  cobertura nós temos. O kRO Zero não tem tabela de item alcançável nenhuma
  (nem `.txt`, nem `iteminfo` em 12 `.rgz`).
- **A regra da sonda mudou por causa disso.** Era "sonda se faltam os `.txt`";
  virou "sonda se o que eu tenho não nomeia metade dos views que esse cliente
  define" (`coverage.mjs`). Motivo: o twRO **tem** 277 cópias de
  `idnum2itemresnametable.txt` e **nenhuma** tabela de nome exibido, então a
  regra antiga teria deixado de sondar e perdido os 21 mil nomes em chinês dele.
- **Estágio 3 nas sete origens, nos dois espaços**: **3.272 pares (tipo, view)** —
  2.934 de chapéu e 338 de capa. 1.239 listados no app, 1.054 que o LATAM
  desenha, **613 que ele nomeia e não desenha** e **75 que ele não define**
  (exclusivos de fora). **3.021 dos 3.272 têm nome**; 251 não têm nenhum.

  `need = 981` — 789 de chapéu e 192 de capa. Mas o número que importa para o
  produto é menor, e a flag `costume` do `iteminfo` é o que permite dizer:

  | dos 981 que o LATAM não tem | |
  |---|---|
  | marcados como fantasia | **496** (374 chapéu, 122 capa) |
  | equipamento comum, que o app omite de propósito | 153 |
  | sem a flag publicada (views só de kRO/jRO) | 332 |
  | com nome | 770 |
  | com identificador em inglês (`aegis`) | 282 |

  **As 496 fantasias têm todas nome**: 356 pelo twRO, 79 pelo LATAM, 41 pelo
  twRO Zero, 20 pelo iRO. No shortlist inteiro, 1.407 pares têm nome só de
  cliente estrangeiro e 644 desses têm também o identificador em inglês.

  O `need` da faixa 0–499 de chapéu subiu de 12 para 111 só por separar os
  espaços: eram views de chapéu que um id de capa no app escondia.
- **Estágio 4** no twRO: 681 sprites pedidos, 38 resolvidos nos 250 arquivos
  indexados, 2 baixados (7,9 MB) e **84 arquivos de sprite escritos** em
  `mirror/twro`. Conferido que é arte de verdade, não lixo: o `decodeSprFrames`
  do ragassets lê 30–46 frames em cada `.spr` (`남_c_fox_ear_beret.spr`, 38x46).

### Quatro coisas que só apareceram implementando

1. **Havia dois espaços de numeração de view id, e o pipeline tratava como um.**
   Descoberto validando o LATAM contra o próprio app: o catálogo dava "Faca",
   "Espada", "Kataná" para os views 1, 2 e 3, e "Asas do Tormento" para o view
   10, cujo sprite de acessório é um óculos de mergulho.
   - Um chapéu numera por `AccessoryId`/`AccName`; uma **capa** numera por
     `SpriteRobeId`/`SpriteRobeName`. O view 8 do LATAM é "Máscara de Segurança"
     como chapéu e "Asas da Fênix" como capa. O app já sabia disso — o
     `gearViews()` devolve `{ headgear, garment }` — o extrator é que não.
   - O `ClassNum` do item é o view id **dentro do espaço dele**, e o de uma arma
     é um terceiro espaço (`ClassNum` 2 = espada). Por isso ler `ClassNum` sem
     decidir o espaço primeiro cola nome de arma em view id baixo de chapéu.
   - O que decide o espaço, sem ler texto localizado: o `resourceName` do item.
     `_<res>` na tabela de acessório → chapéu; `<res>` na tabela de capa (o nome
     coreano da pasta é a mesma string) → capa; nenhuma das duas → não é
     fantasia. **1.971 itens do LATAM tinham `ClassNum` e não pertencem a
     nenhum dos dois** — eram esses que envenenavam o join.
   - Validação: o `ClassNum` concorda com o espaço resolvido em **3.075 itens**
     e discorda em 56. E o catálogo reconstruído dos patches crus reproduz
     **1.148 dos 1.239 pares (tipo, view) nomeados do app**, com o mesmo nome.
     Os 67 que diferem são outro item para a mesma arte; 23 não casam.
   - Regra de escolha do item, que também estava errada: "menor id ganha"
     pegava o chapéu pré-fantasia que o cliente já não nomeia. Agora é *ter
     nome* > *ser a versão fantasia* (`costume`) > menor id, que é o que faz o
     app mostrar "[Visual] Óculos Elegantes" e não "Óculos Charmoso" de 2005.
2. **O estágio 2 pegava o arquivo mais novo, não o mais novo *legível*.** No jRO
   isso é um `.gsf` v0x300: ele baixou 114 MB e extraiu nada. Agora consulta o
   ledger do estágio 1, pula os `blocked` e **diz qual cópia mais nova ele
   deixou passar** — uma tabela velha nunca se apresenta como atual.
3. **O twRO não tem as tabelas que o plano assumiu.** `idnum2itemresnametable`
   e `idnum2itemdisplaynametable` não existem em nenhum dos 2.833 arquivos
   indexados dele — o catálogo saía com `items: 0` e nenhum nome. O dado está em
   `System/iteminfo_new.lub` dentro de um `.rgz`, que o plano tinha classificado
   como risco adiável. Virou a fonte **preferida**: o `ClassNum` de cada item é o
   view id, então o join deixa de ser convenção e passa a ser o que o cliente
   diz. A VM Lua do ragassets já lia esse arquivo para o LATAM.
4. **Nome de recurso não está no idioma do servidor.** `resource name` é caminho
   dentro do GRF, então todo cliente guarda o coreano original: para a Poção
   Vermelha, a tabela de recurso do jRO tem o nome coreano e a de exibição tem
   `赤ポーション`.
   Decodificar a de recurso como Shift-JIS *parece* funcionar e casa com nada —
   o join estava em 949/2.805 e foi para 2.257/2.805 depois de separar as duas.
   Resource usa o `decodeClientString` do ragassets (que já resolve
   ASCII+EUC-KR/UTF-8/CP1252); exibição usa o encoding da origem.

### O que falta

- ~~**Rodar o estágio 1 completo.**~~ — **feito (2026-11-17)**: 12.299 arquivos,
  1.914.922 caminhos, 147,2 MB, zero erro, 209 bloqueados (kRO 141, jRO 68).
  Levou ~2h30 em vez das ~5 h estimadas porque o limitador é por host, então as
  sete origens rodaram em cinco processos agrupados por host.
- ~~**Rodar o `fetch`.**~~ — **feito (2026-11-18)**: 665/665 views do plano
  completas, 499 requisições, 577 MB, 70.989 arquivos, zero parciais. Restam as
  160 inalcançáveis (instalador ou v0x300).
- ~~**Estágio 5 — o catálogo.**~~ — **feito (2026-11-18)**: 663 fantasias
  completas, zero descartada, em `~/ro-multiserver/foreign-costumes.json`. No
  caminho apareceram dois bugs do planejador (cobertura por view em vez de por
  caminho; origem escolhida por quantidade em vez de por conseguir desenhar) e
  um contador de resume que subnotificava.
- **Estágio 5 — as passadas do ragassets e a publicação.** É o que falta para
  isso aparecer no app: `--robe-index`, `gen-skin-table`, ícones, ilustrações e
  efeitos, rodados por árvore, e a publicação com a dimensão `origin`. O espelho
  está pronto em `~/ro-multiserver/mirror/<origem>`. **Publicar é decisão sua** —
  em ragassets, push em `main` faz deploy.
- ~~**Nomes de iRO e kRO.**~~ — **feito, e a resposta é ruim**: não existe nome
  humano em inglês para pegar. O iRO parou de publicar as tabelas `.txt` em
  2016, **não publica nenhum caminho fora de `data\`** (ou seja, nunca manda
  `System\iteminfo_new.lub`, nem em `.rgz`), e a "tabela de nome exibido" dele
  é de identificadores, não de prosa: 7.379 dos 8.367 valores têm sublinhado
  (`Orange_Potion`). O kRO tem o mesmo problema por outro caminho (v0x300
  bloqueado). Então os nomes humanos disponíveis são pt-BR (LATAM), chinês
  (twRO/Zero), japonês (jRO) e coreano (kRO, de 2025) — **inglês só como
  identificador**, via `ItemDBNameTbl.lub`, que é o que a coluna `aegis` do
  shortlist carrega. Isso muda a decisão de produto do risco #4: não há inglês
  neutro para exibir, a escolha é entre nome original com badge ou tradução
  nossa a partir do identificador.
- **O fix (c) (v0x300) custa nome, não só asset.** O kRO não tem nome moderno
  nenhum por causa dele, e a tabela de item do jRO está 8 meses atrasada (seq
  6059 contra 6202). Em ambos o `iteminfo_new.lub` está dentro dos `.gsf`
  bloqueados — 12 `.rgz` sondados em cada um, ~70 MB somados, nenhum trazia.
- **O kRO Zero não tem tabela de item alcançável.** Nem `.txt` no índice, nem
  `iteminfo` nos 12 `.rgz` mais novos. Cada nova rodada da sonda desce 12
  arquivos mais fundo (~22 MB); vale fazer isso algumas vezes antes de concluir
  que não existe, mas é a origem de menor valor (fantasias quase todas em comum
  com o kRO).
- **Fix (b)**, o 404 do `/image`, que é o que torna o `need` do estágio 3 exato.
- **Atenção ao resolver:** a extração dobra caminhos sob `data/` para
  minúsculas, então quem resolver essas árvores precisa ser case-insensitive.
- **O ragassets está sem commit** (v0x103, `--min-folders`, `grfEntrySpan`). Lá, `main` é o branch de
  trabalho e **push em `main` faz deploy**, então o commit é decisão sua.

---

## 10. thRO — medido 2026-11-19

O servidor tailandês ficou fora deste plano por um motivo errado. A §1 o botou
no grupo "launcher próprio, sem índice estilo Gravity", junto com idRO, vnRO,
cRO e ROPrime, apoiada em o RSU marcar todos como "Support: No". **O thRO tem
índice de patch, no mesmo formato dos outros seis, e patcheia todo dia.** O RSU
não saber dele não é evidência de que não exista.

### Como se acha o endpoint de um oficial que "não tem" endpoint

O caminho não é específico do thRO e é o que recomendo repetir para idRO, vnRO
e cRO antes de dá-los por perdidos:

1. **Ache o cliente completo.** O site (`ro.gnjoy.in.th`) manda para
   `/game_download`, que manda para `/thankyou/`, onde ficam os links de verdade
   — em `rofull.gnjoy.in.th`, um bucket **Tencent COS** com `Accept-Ranges`.
2. **Leia o `ServerInfo_<país>.lub` do patcher de dentro do zip, sem baixar o
   zip.** Um membro de um ZIP é um stream deflate independente: lendo o
   diretório central pelo fim (Range) e depois só os bytes comprimidos daquele
   membro, 601 bytes resolvem o que seriam 4,26 GB.
3. **O `.lub` é bytecode Lua 5.1 sem criptografia** e as constantes saem com um
   walker de 20 linhas. O `ServerInfo_TH.lub` entrega a configuração inteira:

   ```
   g_strWeb     = ropatch.gnjoy.in.th/      g_strWebDir  = /patchinfo
   g_strPatch   = patch.txt                 g_strHttpDir = /patchfile
   g_strPatchInf = patch.inf                g_strPatchData = data.grf
   ```

   O `Local.lua` ao lado lista **as 21 configurações de serviço que a Gravity
   mantém** — KR, KR_Sak, KR_Zero, USA, CN, TW, TW_restart, BR, BR_Sak, PH, FR,
   TH, ID, JP (+sak, urdr, thanatos, lobby), MYSG, RU, VN. Cada cliente completo
   só embarca o seu, então é um arquivo por origem, não uma lista pronta.

Detalhe que custa uma hora: `http://ropatch.gnjoy.in.th/...` responde **301**
para HTTPS, a raiz responde **403** (listagem de bucket desligada) e um timeout
curto no handshake devolve 000. Sonde um caminho real com HTTPS e tempo
folgado, não a raiz.

### O que o índice entrega

| | |
|---|---|
| Índice | `https://ropatch.gnjoy.in.th/patchinfo/patch.txt` — 154.767 bytes |
| Store | `https://ropatch.gnjoy.in.th/patchfile/` |
| Sequências | **3.312** (1.099 GRF + 2.214 `.rgz`), de 2020-04-23 a **2026-11-18** |
| Formato | `.gpf` **v0x102** — `Master of Magic`, versão `02 01`, o caso fácil |
| Range | `Accept-Ranges: bytes` no store (tencent-cos) |

Ou seja: **o thRO não precisa de código novo.** É o mesmo caminho do twRO, que
a §3 já chama de melhor origem — v0x102, patch do dia, HTTPS com Range. Pelo
critério da §8 ele entraria logo depois do twRO, não no fim da fila.

### O cliente completo como segunda fonte

O `rofull.gnjoy.in.th/RagnarokOnline.zip` (4,26 GB, 707 membros) é uma árvore de
arquivos, não um instalador empacotado — ao contrário do
`RagnarokOnlineInstaller.zip`, que tem só três `RAG_SETUP_*.bin` deflatados e
não serve para leitura seletiva. Dele saem, por Range:

- `System/itemInfo_new.lub` — 2,15 MB comprimidos, 8,75 MB abertos, **LuaQ 5.1
  sem criptografia**: 54.216 constantes string, **31.204 com caractere
  tailandês**, e os campos de sempre (`identifiedDisplayName`,
  `identifiedResourceName`, `slotCount`, `ClassNum`). O `identifiedResourceName`
  é a chave de junção que o resto do pipeline já usa.
- `RagnarokTH.ini` está **criptografado** (1.172 bytes ilegíveis). Não é por ali.
- `patch.inf` = `1659`, a sequência que o cliente trazia; o índice vivo está em
  3.312.

Duas ressalvas que impedem de tratar esse zip como a fonte de nomes:

1. **A tabela é de 2024-11-21** (o caminho de build embutido diz
   `1732103383_20241121_production_patch`).
2. **O `itemInfo_new.lub` é parcial.** Tem 2.298 nomes de sprite únicos, 358
   começando com `c_`/`_c_`, e menciona **51 dos 517** visuais que publicamos
   hoje. O nome autoritativo vive no `idnum2itemdisplaynametable.txt` dentro do
   `data.grf` — que no zip é um membro deflate de 3,9 GB, então vem dos patches,
   não daqui.

E um aviso de método: tentei pareá-lo por "a string tailandesa mais próxima
antes do resource name" e saiu **errado** — o Lua 5.1 interna cada constante uma
vez por função, então a ordem do pool não reproduz a ordem do arquivo e o que
vem antes é linha de descrição, não nome. O pareamento é trabalho do leitor de
bytecode que o ragassets já tem para LATAM/twRO/twRO Zero.

---

## 11. Os outros cinco oficiais — sondados 2026-11-19

Depois que o thRO saiu do grupo "sem índice" (§10), rodei o mesmo caminho nos
cinco que sobraram. **Nenhum entra hoje**, mas por motivos bem diferentes, e a
diferença é o que diz onde vale insistir:

| origem | o que achei | veredito |
|---|---|---|
| **cRO** (Zhaouc) | `.rar` da árvore do cliente, 4,0 GB, Range, RAR5 não sólido, 308 de 400 membros `store` | **rota existe** — falta ver em que balde caem as tabelas |
| **idRO** (GNJoy ID) | só instalador Inno Setup empacotado (2,6 GB); 7 hosts de patch não resolvem | precisa de um leitor de Inno, ou do cliente instalado |
| **ROPrime** (4game) | distribuição exclusiva pelo launcher próprio | precisa do launcher |
| **vnRO** (VTC) | site em manutenção, 503 | indisponível na data |
| **Zero Global** (GGT) | Cloudflare 1009: país BR banido pelo operador | bloqueado, e não é falha técnica |

### idRO — Ragnarok Online Classic (GNJoy Indonésia)

Vivo e ativo: `ro.gnjoy.id` redireciona para `roclassic.gnjoy.id`, que tem
página de download. O cliente é
`https://download.gnjoy.id/roc/full/ROC_INSTALLER.zip` (2.578.357.153 bytes,
nginx, Range) — mas **é um instalador empacotado, não uma árvore de arquivos**:
quatro membros, sendo dois `ROC_Installer-1a/1b.bin` de 1,4 GB e 1,18 GB
**STORED** e um `ROC_Installer.exe` deflatado. Li o início do primeiro `.bin`:
assinatura `idska32\x1a` seguida de `zlb\x1a` — fatia de **Inno Setup** com
bloco comprimido.

Isso não é um "impossível", é um preço: o Inno Setup guarda a tabela de arquivos
num header comprimido no começo da primeira fatia e, por padrão, comprime
**arquivo por arquivo** em vez de num bloco sólido — então, com um leitor de
header do Inno (trabalho da classe do `innoextract`, específico por versão),
daria para alcançar um arquivo isolado por Range, como fizemos no ZIP
tailandês. O que não dá é o que tentei aqui: ler o `ServerInfo_ID.lub` sem
entender o formato do instalador.

Puxei o `ROC_Installer.exe` (1,44 MB comprimidos) e varri strings ASCII e
UTF-16: só URLs de certificado da DigiCert e a ajuda do `jrsoftware.org`. É Inno
Setup puro, sem nada do patcher.

Também não achei o índice por adivinhação: `ropatch`, `rocpatch`, `patch`,
`roclassicpatch`, `rocdn`, `cdn` e `file` sob `gnjoy.id` **não resolvem**, e oito
nomes de arquivo plausíveis sob `/roc/` e `/roc/full/` deram 404 (o diretório
`/roc/` responde 403, então existe — a listagem é que está desligada). Para o
idRO falta instalar o cliente e ler o `ServerInfo_ID.lub` de dentro dele, que é
exatamente o que o §10 evitou no thRO.

### vnRO — VTC Game (Vietnã)

`ro.vtcgame.vn` responde **503 com página de manutenção** ("BẢO TRÌ", rodapé ©
2025), inclusive num navegador de verdade. Não há página de download para ler, e
uma busca não achou nenhum RO de PC da VTC em operação hoje — só títulos mobile
de outras publicadoras. Não dá para medir e não vou chamar de morto sem
evidência: fica como **indisponível na data**.

### ROPrime — 4game / Inn.games (EU e RU)

`eu.4game.com/roprime` é a página viva (o `ru.4game.com/ro/` redireciona para
`ru.4game.ru/ro/`, que dá 404). A distribuição é **só pelo launcher próprio** —
"one launcher for all games" — e nenhuma página expõe cliente, patcher ou CDN.
Mesma situação do idRO, com uma camada a mais: o launcher é que resolve os
endereços, em tempo de execução.

### Ragnarok Zero Global — GGT

`roz.mygnjoy.com` dá **403 do Cloudflare, erro 1009**, e a página diz o motivo
em letras garrafais: *"The owner of this website has banned the country or
region your IP address is in (BR)"*. Não é falha técnica nem site fora do ar — é
decisão de acesso do operador, e o respeito a ela é o fim da linha por aqui.
Qualquer medição desse serviço precisa partir de outro lugar.

### Ruído que vale ter documentado

O portal `gnjoy.id` linka `roglobal.com`, `rogo.gnjoyglobal.com`,
`roidle.gnjoy.asia`, `theragnaroksea.com`, `rotwilight.onelink.me` e
`rofrontier.gnjoy.id`. **Nenhum é RO de PC**: o primeiro é o Ragnarok Origin
global (mobile) e os outros são mobile ou estão fora do ar (`rofrontier` recusa
conexão na 443). O `wlanding-rop.gnjoy.in.th` é um cliente web com tela de
login, não um cliente com GRF. Contar qualquer um deles como origem seria
inflar a lista.

### cRO — Zhaouc (China): o único dos cinco com rota

Aqui tem caminho. O site (`ro.zhaouc.com`) publica o cliente completo em
`https://d1.zhaouc.com/RO20261016.rar` — **4.008.210.153 bytes**, Tencent COS,
`Accept-Ranges: bytes`, `Last-Modified` 2026-10-22 — e, ao contrário do idRO,
**é a árvore de arquivos do cliente, não um instalador**: o primeiro membro já é
`Mss32.dll`.

Escrevi um walker de RAR5 que anda a cadeia de headers por Range e pula os dados
por aritmética de offset (`scripts/rarwalk.mjs` no scratchpad da sessão; 400
membros custaram **34 reads e 1,1 MB**). O que ele diz:

| | |
|---|---|
| Formato | RAR5 (`Rar!\x1a\x07\x01\x00`), **não sólido** |
| Métodos nos 400 primeiros | **308 `store`**, 92 `normal` |
| Árvore | `Ragexe.exe`, `Setup.exe`, `RagHash.dat`, `rolauncher.exe`, `.lub` de System — cliente Gravity de verdade |

**Não sólido + `store`** é a combinação que importa: um membro armazenado se lê
no lugar com um único Range, sem decodificador nenhum. Provei puxando o
`ROCN.ini` (1.351 bytes, `store`, offset 13.546.864). Os 92 `normal` precisariam
de um decodificador RAR — que, diferente do deflate, não vem no node.

E o `ROCN.ini` rendeu um achado lateral que vale para todas as origens:

> Os **22 primeiros bytes do `ROCN.ini` do cRO são idênticos aos do
> `RagnarokTH.ini` do thRO** (`ec de 6d d8 c9 f7 a4 4c db 0d f3 ae 22 57 b9 40
> b7 71 cb cd e4 21`). Dois operadores, dois países, o mesmo esquema de
> criptografia. Então um decryptor de `.ini` serviria a todos — e seria uma
> segunda rota para o endpoint de patch exatamente nos clientes onde o
> `ServerInfo` está fora de alcance, como o idRO.

O que falta medir no cRO é **em qual balde caem os arquivos que interessam** —
`ServerInfo_CN.lub` (para o endpoint de patch), `System/itemInfo*.lub` e o
`data.grf`. Se forem `store`, o cRO entra pelo mesmo custo do thRO; se forem
`normal`, precisa de um leitor de RAR antes. O walk completo ficou pendente
porque o host começou a estrangular a banda no meio da caminhada — é um
"continuar", não um "não dá".
