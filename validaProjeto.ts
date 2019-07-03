import { Erro, Severity } from './erros';
import { Duplicados } from './models/Duplicados';
import { Fonte, Funcao, Tipos } from './fonte';
import { ItemModel } from './models/ItemProject';
import * as globby from 'globby';
import * as fileSystem from 'fs';
import { ValidaAdvpl } from './validaAdvpl';
import { version } from './package.json';
import { resolve } from 'dns';

export class ValidaProjeto {
  public projeto: ItemModel[];
  public comentFontPad: string[];
  public ownerDb: string[];
  public empresas: string[];
  public local;
  public version: string = version;
  private advplExtensions = ['prw', 'prx', 'prg', 'apw', 'apl', 'tlpp'];
  protected listaDuplicados = [];

  constructor(
    comentFontePad: string[],
    local: string,
    private log: boolean = true
  ) {
    this.local = local;
    this.comentFontPad = comentFontePad;
    this.ownerDb = [];
    this.empresas = [];
  }
  public async validaProjeto(pathProject: string): Promise<ValidaProjeto> {
    return new Promise(async (resolve: Function) => {
      let erros: number = 0;
      let warnings: number = 0;
      let hint: number = 0;
      let information: number = 0;

      this.projeto = [];
      // monta expressão para buscar arquivos
      let globexp: any[] = [];
      for (var i = 0; i < this.advplExtensions.length; i++) {
        globexp.push(`**/*.${this.advplExtensions[i]}`);
      }
      // busca arquivos na pasta
      let files: string[] = await globby.sync(globexp, {
        cwd: pathProject,
        caseSensitiveMatch: false
      });

      // valida arquivos
      let promisses: Promise<ValidaAdvpl>[] = [];

      let startTime: any = new Date();
      if (this.log) {
        console.log(startTime);
        console.log('Analise de Projeto: ' + pathProject);
      }

      files.forEach((fileName: string) => {
        let valida: ValidaAdvpl = new ValidaAdvpl(
          this.comentFontPad,
          this.local,
          this.log
        );
        valida.ownerDb = this.ownerDb;
        valida.empresas = this.empresas;

        if (this.log) {
          console.log('Arquivo: ' + fileName);
        }
        let conteudo = fileSystem.readFileSync(
          pathProject + '\\' + fileName,
          'latin1'
        );

        promisses.push(
          valida.validacao(conteudo, pathProject + '\\' + fileName)
        );
      });

      Promise.all(promisses).then((validacoes: ValidaAdvpl[]) => {
        validacoes.forEach((validacao: ValidaAdvpl) => {
          let itemProjeto = new ItemModel();
          itemProjeto.content = validacao.conteudoFonte;
          itemProjeto.errors = validacao.aErros;
          itemProjeto.fonte = validacao.fonte;

          this.projeto.push(itemProjeto);

          erros += validacao.error;
          warnings += validacao.warning;
          information += validacao.information;
          hint += validacao.hint;
        });

        // verifica duplicados
        this.verificaDuplicados().then(() => {
          this.projeto.forEach((item: ItemModel) => {
            let fonte: Fonte = item.fonte;
            if (fonte.duplicado) {
              item.errors.push(
                new Erro(
                  0,
                  0,
                  traduz('validaAdvpl.fileDuplicate', this.local),
                  Severity.Error
                )
              );
              erros++;
            }
            fonte.funcoes.forEach((funcao: Funcao) => {
              if (funcao.duplicada) {
                item.errors.push(
                  new Erro(
                    funcao.linha,
                    funcao.linha,
                    traduz('validaAdvpl.functionDuplicate', this.local),
                    Severity.Error
                  )
                );
                erros++;
              }
            });
          });

          if (this.log) {
            console.log(`\t${erros} Errors`);
            console.log(`\t${warnings} Warnings`);
            console.log(`\t${information} Informations`);
            console.log(`\t${hint} Hints`);

            // calcula tempo gasto
            let endTime: any = new Date();
            let timeDiff = endTime - startTime; //in ms
            // strip the ms
            timeDiff /= 1000;

            // get seconds
            let seconds = Math.round(timeDiff);
            console.log('Terminou! (' + seconds + ' segundos)');
            resolve(this);
          }
        });
      });
    });
  }

  public verificaDuplicados(): Promise<Duplicados> {
    return new Promise((resolve: Function) => {
      let listaFuncoes: string[] = [];
      let funcoesDuplicadas: string[] = [];
      let listaArquivos: string[] = [];
      let arquivosDuplicados: string[] = [];

      this.projeto.forEach((item: ItemModel) => {
        let fonte: Fonte = item.fonte;
        //verifica se o fonte ainda existe
        try {
          fileSystem.statSync(fonte.fonte);
        } catch { }

        fonte.funcoes.forEach((funcao: Funcao) => {
          // não aponta como duplicadas as static Functions ou metodos
          if (funcao.tipo !== Tipos["Static Function"] && funcao.tipo !== Tipos.Method) {
            let functionName: string = (funcao.nome + funcao.tipo).toUpperCase();
            //monta lista de funções duplicadas
            if (listaFuncoes.indexOf(functionName) === -1) {
              listaFuncoes.push(functionName);
            } else {
              funcoesDuplicadas.push(functionName);
            }
          }
        });

        let fileName = fonte.fonte
          .replace(/\\/g, '/')
          .substring(fonte.fonte.replace(/\\/g, '/').lastIndexOf('/') + 1)
          .toUpperCase();
        //monta lista de qrquivos duplicados
        if (listaArquivos.indexOf(fileName) === -1) {
          listaArquivos.push(fileName);
        } else {
          arquivosDuplicados.push(fileName);
        }
      });
      // marca duplicados
      this.projeto.forEach((item: ItemModel) => {
        let fonte: Fonte = item.fonte;

        fonte.funcoes.forEach((funcao: Funcao) => {
          let functionName: string = (funcao.nome + funcao.tipo).toUpperCase();
          //monta lista de funções duplicadas
          funcao.duplicada = funcoesDuplicadas.indexOf(functionName) > -1;
        });

        let fileName = fonte.fonte
          .replace(/\\/g, '/')
          .substring(fonte.fonte.replace(/\\/g, '/').lastIndexOf('/') + 1)
          .toUpperCase();
        //monta lista de arquivos duplicados
        fonte.duplicado = arquivosDuplicados.indexOf(fileName) > -1;
      });
      resolve()
    });
  }
}

function traduz(key, local) {
  let locales: string[] = ['en', 'pt-br'];
  let i18n = require('i18n');
  i18n.configure({
    locales: locales,
    directory: __dirname + '/locales'
  });
  i18n.setLocale(locales.indexOf(local) + 1 ? local : 'en');
  return i18n.__(key);
}
