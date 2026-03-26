Crie o scaffold de uma nova tool para o agente.

Pergunte ao usuário:
- Nome da tool
- O que ela faz (descrição)
- Quais parâmetros recebe
- O que retorna

Depois crie o arquivo em `src/tools/<nome-da-tool>.js` seguindo o padrão de tool use do Anthropic SDK:
- Exportar objeto com `name`, `description`, `input_schema`
- Exportar função `execute(input)` que implementa a lógica
- Adicionar comentários TODO onde a lógica real deve ser implementada
