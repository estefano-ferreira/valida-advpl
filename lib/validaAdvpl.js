"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const include_1 = require("./include");
const erros_1 = require("./erros");
const fonte_1 = require("./fonte");
class ValidaAdvpl {
    constructor(comentFontePad, local) {
        this.i18n = require("i18n");
        this.i18n.configure({
            locales: ["enu", "ptb"],
            directory: __dirname + "/locales"
        });
        if (!local) {
            local = "ptb";
        }
        this.i18n.setLocale(local);
        this.aErros = [];
        this.includes = [];
        this.error = 0;
        this.warning = 0;
        this.information = 0;
        this.hint = 0;
        this.versao = "";
        //Se nÃ£o estÃ¡ preenchido seta com valor padrÃ£o
        this.comentFontPad = comentFontePad;
        this.ownerDb = [];
        this.empresas = [];
    }
    validacao(texto, path) {
        this.aErros = [];
        this.includes = [];
        let fonte = new fonte_1.Fonte(path);
        let objeto = this;
        let conteudoSComentario = "";
        let linhas = texto.split("\n");
        //Pega as linhas do documento ativo e separa o array por linha
        let comentFuncoes = new Array();
        let funcoes = new Array();
        let prepareEnvionment = new Array();
        let cBeginSql = false;
        let FromQuery = false;
        let JoinQuery = false;
        let cSelect = false;
        let ProtheusDoc = false;
        let emComentario = false;
        //Percorre todas as linhas
        for (var key in linhas) {
            //seta linha atual em caixa alta
            let linha = linhas[key].toLocaleUpperCase();
            let linhaClean = "";
            //se estiver no PotheusDoc vê se está fechando
            if (ProtheusDoc && linha.search("\\/\\*\\/") !== -1) {
                ProtheusDoc = false;
            }
            //verifica se é protheusDoc
            if (linha.search(/\/\*\/+( |)+\{PROTHEUS\.DOC\}/) !== -1) {
                ProtheusDoc = true;
                //reseta todas as ariáveis de controle pois se entrou em ProtheusDoc está fora de qualquer função
                cBeginSql = false;
                FromQuery = false;
                JoinQuery = false;
                cSelect = false;
                //verifica se é um comentário de função e adiciona no array
                comentFuncoes.push([
                    linha
                        .trim()
                        .replace(/\/\*\/+( |)+\{PROTHEUS\.DOC\}/, "")
                        .trim()
                        .toLocaleUpperCase(),
                    key
                ]);
            }
            //verifica se a linha está toda comentada
            let posComentLinha = linha.search(/\/\//);
            let posComentBloco = linha.search(/\/\*/);
            posComentBloco = posComentBloco === -1 ? 999999 : posComentBloco;
            posComentLinha = posComentLinha === -1 ? 999999 : posComentLinha;
            if (!emComentario && posComentLinha < posComentBloco) {
                linha = linha.split("//")[0];
            }
            //Verifica se está em comentário de bloco
            //trata comentários dentro da linha
            linha = linha.replace(/\/\*+.+\*\//, "");
            if (linha.search(/\*\//) !== -1 && emComentario) {
                emComentario = false;
                linha = linha.split(/\*\//)[1];
            }
            //se não estiver dentro do Protheus DOC valida linha
            if (!emComentario) {
                if (linha
                    .replace(/\"+.+\"/, "")
                    .replace(/\'+.+\'/, "")
                    .search(/\/\*/) !== -1) {
                    emComentario = true;
                    linha = linha.split(/\/\*/)[0];
                }
                //Se não estiver em comentário verifica se o último caracter da linha é ;
                if (!emComentario && linha.charAt(linha.length - 1) === ";") {
                    linhas[parseInt(key) + 1] = linha + " " + linhas[parseInt(key) + 1];
                    linha = "";
                }
                //trata comentários em linha ou strings em aspas simples ou duplas
                //não remove aspas quando for include
                linha = linha.split("//")[0];
                linhaClean = linha;
                if (linha.search(/#INCLUDE/) === -1) {
                    while (linhaClean.search(/\"+.+\"/) !== -1 ||
                        linhaClean.search(/\'+.+\'/) !== -1) {
                        let colunaDupla = linhaClean.search(/\"+.+\"/);
                        let colunaSimples = linhaClean.search(/\'+.+\'/);
                        //se a primeira for a dupla
                        if (colunaDupla !== -1 &&
                            (colunaDupla < colunaSimples || colunaSimples === -1)) {
                            let quebra = linhaClean.split('"');
                            linhaClean = linhaClean.replace('"' + quebra[1] + '"', "");
                        }
                        else {
                            let quebra = linhaClean.split("'");
                            linhaClean = linhaClean.replace("'" + quebra[1] + "'", "");
                        }
                    }
                }
                conteudoSComentario = conteudoSComentario + linhaClean + "\n";
                //verifica se é função e adiciona no array
                if (linhaClean.search(/(STATIC|USER|)+(\ |\t)+FUNCTION+(\ |\t)/) !== -1 &&
                    linhaClean
                        .trim()
                        .split(" ")[0]
                        .match(/STATIC|USER|FUNCTION/)) {
                    //reseta todas as ariáveis de controle pois está fora de qualquer função
                    cBeginSql = false;
                    FromQuery = false;
                    JoinQuery = false;
                    cSelect = false;
                    let nomeFuncao = linhaClean
                        .replace("\t", " ")
                        .trim()
                        .split(" ")[2]
                        .split("(")[0];
                    //verifica se é um função e adiciona no array
                    funcoes.push([nomeFuncao, key]);
                    //verifica o TIPO
                    if (linhaClean.search(/(USER)+(\ |\t)+FUNCTION+(\ |\t)/) !== -1) {
                        fonte.addFunction(fonte_1.Tipos["User Function"], nomeFuncao, parseInt(key));
                    }
                    else if (linhaClean.split(" ")[0].split("\t")[0] === "FUNCTION") {
                        //verifica se a primeira palavra é FUNCTION
                        fonte.addFunction(fonte_1.Tipos["Function"], nomeFuncao, parseInt(key));
                    }
                }
                //Verifica se é CLASSE ou WEBSERVICE
                if (linhaClean.search("METHOD\\ .*?CLASS") !== -1 ||
                    linhaClean.split(" ")[0].split("\t")[0] === "CLASS" ||
                    linhaClean.search("WSMETHOD.*?WSSERVICE") !== -1 ||
                    linhaClean.search("WSSERVICE\\ ") !== -1) {
                    //reseta todas as ariáveis de controle pois está fora de qualquer função
                    cBeginSql = false;
                    FromQuery = false;
                    JoinQuery = false;
                    cSelect = false;
                    //verifica se é um função e adiciona no array
                    funcoes.push([
                        linhaClean
                            .trim()
                            .split(" ")[1]
                            .split("(")[0],
                        key
                    ]);
                    if (linhaClean.split(" ")[0].split("\t")[0] === "CLASS") {
                        fonte.addFunction(fonte_1.Tipos["Class"], linhaClean
                            .trim()
                            .split(" ")[1]
                            .split("(")[0], parseInt(key));
                    }
                }
                //Verifica se adicionou o include TOTVS.CH
                if (linha.search(/#INCLUDE/) !== -1) {
                    //REMOVE as aspas a palavra #include e os espacos e tabulações
                    objeto.includes.push({
                        include: linha
                            .replace(/#INCLUDE/g, "")
                            .replace(/\t/g, "")
                            .replace(/\'/g, "")
                            .replace(/\"/g, "")
                            .trim(),
                        linha: parseInt(key)
                    });
                }
                if (linhaClean.search(/BEGINSQL+(\ |\t)+ALIAS/) !== -1) {
                    cBeginSql = true;
                }
                if (linhaClean.search(/PREPARE+(\ |\t)+ENVIRONMENT+(\ |\t)/) !== -1) {
                    prepareEnvionment.push(parseInt(key));
                }
                if (linha.match(/(\ |\t|\'|\"|)+SELECT+(\ |\t)/) ||
                    linha.match(/(\ |\t|\'|\"|)+DELETE+(\ |\t)/) ||
                    linha.match(/(\ |\t|\'|\"|)+UPDATE+(\ |\t)/)) {
                    cSelect = true;
                }
                if (!cBeginSql &&
                    (linha.search(/(\ |\t|\'|\"|)+DBUSEAREA+(\ |\t|)+\(+.+TOPCONN+.+TCGENQRY/) !== -1 ||
                        linhaClean.search(/TCQUERY+(\ |\t)/) !== -1)) {
                    objeto.aErros.push(new erros_1.Erro(parseInt(key), parseInt(key), this.i18n.__("validaAdvpl.queryNoEmbedded"), erros_1.Severity.Warning));
                    FromQuery = false;
                    cSelect = false;
                }
                if (linha.search(/(\ |\t|\'|\")+DELETE+(\ |\t)+FROM+(\ |\t)/) !== -1) {
                    objeto.aErros.push(new erros_1.Erro(parseInt(key), parseInt(key), this.i18n.__("validaAdvpl.deleteFrom"), erros_1.Severity.Warning));
                }
                if (linhaClean.search(/MSGBOX\(/) !== -1) {
                    objeto.aErros.push(new erros_1.Erro(parseInt(key), parseInt(key), this.i18n.__("validaAdvpl.msgBox"), erros_1.Severity.Information));
                }
                if (linha.search(/GETMV\(+(\ |\t|)+(\"|\')+MV_FOLMES+(\"|\')+(\ |\t|)\)/) !== -1) {
                    objeto.aErros.push(new erros_1.Erro(parseInt(key), parseInt(key), this.i18n.__("validaAdvpl.folMes"), erros_1.Severity.Information));
                }
                if (linha.search("\\<\\<\\<\\<\\<\\<\\<\\ HEAD") !== -1) {
                    //Verifica linha onde terminou o conflito
                    let nFim = key;
                    for (var key2 in linhas) {
                        if (linhas[key2].search("\\>\\>\\>\\>\\>\\>\\>") !== -1 &&
                            nFim === key &&
                            key2 > key) {
                            nFim = key2;
                        }
                    }
                    objeto.aErros.push(new erros_1.Erro(parseInt(key), parseInt(nFim), this.i18n.__("validaAdvpl.conflictMerge"), erros_1.Severity.Error));
                }
                if (linha.search(/(\ |\t|\'|\"|)+SELECT+(\ |\t)/) !== -1 &&
                    linha.search("\\ \\*\\ ") !== -1) {
                    objeto.aErros.push(new erros_1.Erro(parseInt(key), parseInt(key), this.i18n.__("validaAdvpl.selectAll"), erros_1.Severity.Warning));
                }
                if (linha.search("CHR\\(13\\)") !== -1 &&
                    linha.search("CHR\\(10\\)") !== -1) {
                    objeto.aErros.push(new erros_1.Erro(parseInt(key), parseInt(key), this.i18n.__("validaAdvpl.crlf"), erros_1.Severity.Warning));
                }
                if (cSelect && linha.search("FROM") !== -1) {
                    FromQuery = true;
                }
                if (cSelect && FromQuery && linha.search("JOIN") !== -1) {
                    JoinQuery = true;
                }
                if (linha.search("ENDSQL") !== -1 ||
                    linha.search("WHERE") !== -1 ||
                    linha.search("TCQUERY") !== -1) {
                    FromQuery = false;
                    cSelect = false;
                }
                //Implementação para aceitar vários bancos de dados
                this.ownerDb.forEach(banco => {
                    if (cSelect && FromQuery && linha.search(banco) !== -1) {
                        objeto.aErros.push(new erros_1.Erro(parseInt(key), parseInt(key), this.i18n.__("validaAdvpl.noSchema") +
                            banco +
                            this.i18n.__("validaAdvpl.inQuery"), erros_1.Severity.Error));
                    }
                });
                if (cSelect &&
                    (FromQuery || JoinQuery || linha.search("SET") !== -1) &&
                    linha.search("exp:cTable") === -1) {
                    //procura códigos de empresas nas queryes
                    this.empresas.forEach(empresa => {
                        //para melhorar a análise vou quebrar a string por espaços
                        //e removendo as quebras de linhas, vou varrer os itens do array e verificar o tamanho
                        //e o código da empresa chumbado
                        let palavras = linha
                            .replace(/\r/g, "")
                            .replace(/\t/g, "")
                            .split(" ");
                        palavras.forEach(palavra => {
                            if (palavra.search(empresa + "0") !== -1 &&
                                palavra.length === 6) {
                                objeto.aErros.push(new erros_1.Erro(parseInt(key), parseInt(key), this.i18n.__("validaAdvpl.tableFixed"), erros_1.Severity.Error));
                            }
                        });
                    });
                }
                if (cSelect && JoinQuery && linha.search("ON") !== -1) {
                    JoinQuery = false;
                }
                if (linhaClean.search(/CONOUT\(/) !== -1) {
                    objeto.aErros.push(new erros_1.Erro(parseInt(key), parseInt(key), this.i18n.__("validaAdvpl.conout"), erros_1.Severity.Warning));
                }
                //recomendação para melhorar identificação de problemas em queryes
                if ((linha.match(/(\ |\t|)+SELECT+(\ |\t)/) ||
                    linha.match(/(\ |\t|)+DELETE+(\ |\t)/) ||
                    linha.match(/(\ |\t|)+UPDATE+(\ |\t)/) ||
                    linha.match(/(\ |\t|)+JOIN+(\ |\t)/)) &&
                    (linha.match(/(\ |\t|)+FROM+(\ |\t)/) ||
                        linha.match(/(\ |\t|)+ON+(\ |\t)/) ||
                        linha.match(/(\ |\t|)+WHERE+(\ |\t)/)) &&
                    linha.search(/(\ |\t)+TCSQLEXEC+\(/) === -1) {
                    //verifica o caracter anterior tem que ser ou ESPACO ou ' ou " ou nada
                    let itens1 = ["FROM", "ON", "WHERE"];
                    let addErro = false;
                    itens1.forEach(item => {
                        addErro = addErro || linha.search("\\'" + item) !== -1;
                        addErro = addErro || linha.search('\\"' + item) !== -1;
                        addErro = addErro || linha.search("\\ " + item) !== -1;
                    });
                    if (addErro) {
                        objeto.aErros.push(new erros_1.Erro(parseInt(key), parseInt(key), this.i18n.__("validaAdvpl.bestAnalitc") +
                            " SELECT, DELETE, UPDATE, JOIN, FROM, ON, WHERE.", erros_1.Severity.Information));
                    }
                }
            }
            else {
                conteudoSComentario += "\n";
            }
        }
        //Validação de padrão de comentáris de fontes
        let comentariosFonte = true;
        for (var _i = 0; _i < objeto.comentFontPad.length; _i++) {
            let cExpressao = objeto.comentFontPad[_i];
            let linha = linhas[_i];
            comentariosFonte = comentariosFonte && linha.search(cExpressao) !== -1;
        }
        if (!comentariosFonte) {
            objeto.aErros.push(new erros_1.Erro(0, 0, this.i18n.__("validaAdvpl.padComment"), erros_1.Severity.Information));
        }
        //Validação funções sem comentários
        funcoes.forEach(funcao => {
            let achou = false;
            comentFuncoes.forEach(comentario => {
                achou = achou || comentario[0] === funcao[0];
            });
            if (!achou) {
                objeto.aErros.push(new erros_1.Erro(parseInt(funcao[1]), parseInt(funcao[1]), this.i18n.__("validaAdvpl.functionNoCommented"), erros_1.Severity.Warning));
            }
        });
        //Validação comentários sem funções
        comentFuncoes.forEach(comentario => {
            let achou = false;
            funcoes.forEach(funcao => {
                achou = achou || comentario[0] === funcao[0];
            });
            if (!achou) {
                objeto.aErros.push(new erros_1.Erro(parseInt(comentario[1]), parseInt(comentario[1]), this.i18n.__("validaAdvpl.CommentNoFunction"), erros_1.Severity.Warning));
            }
        });
        //Validador de includes
        let oInclude = new include_1.Include();
        oInclude.valida(objeto, conteudoSComentario);
        //Conta os erros por tipo e totaliza no objeto
        this.hint = 0;
        this.information = 0;
        this.warning = 0;
        this.error = 0;
        objeto.aErros.forEach((erro) => {
            if (erro.severity === erros_1.Severity.Hint) {
                this.hint++;
            }
            if (erro.severity === erros_1.Severity.Information) {
                this.information++;
            }
            if (erro.severity === erros_1.Severity.Warning) {
                this.warning++;
            }
            if (erro.severity === erros_1.Severity.Error) {
                this.error++;
            }
        });
        if (this.error > 0 ||
            this.hint > 0 ||
            this.warning > 0 ||
            this.information > 0) {
            console.log(`\t${this.i18n.__("validaAdvpl.foundFile")} ${path}:`);
            if (this.error > 0) {
                console.log(`\t\t${this.error} Errors .`);
            }
            if (this.warning > 0) {
                console.log(`\t\t${this.warning} Warnings .`);
            }
            if (this.information > 0) {
                console.log(`\t\t${this.information} Informations .`);
            }
            if (this.hint > 0) {
                console.log(`\t\t${this.hint} Hints .`);
            }
        }
    }
}
exports.ValidaAdvpl = ValidaAdvpl;
//# sourceMappingURL=validaAdvpl.js.map