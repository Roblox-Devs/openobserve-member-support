let parser: any;
let parserInitialized = false;

const importSqlParser = async () => {
  if (!parserInitialized) {
    const useSqlParser: any = await import("@/composables/useParser");
    const { sqlParser }: any = useSqlParser.default();
    parser = await sqlParser();
    parserInitialized = true;
  }
  return parser;
};

export const addLabelsToSQlQuery = async (originalQuery: any, labels: any) => {
  await importSqlParser();

  let dummyQuery = "select * from 'default'";

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    dummyQuery = await addLabelToSQlQuery(
      dummyQuery,
      label.name,
      label.value,
      label.operator
    );
  }

  const astOfOriginalQuery: any = parser.astify(originalQuery);
  const astOfDummy: any = parser.astify(dummyQuery);

  // if ast already has a where clause
  if (astOfOriginalQuery.where) {
    const newWhereClause = {
      type: "binary_expr",
      operator: "AND",
      left: {
        ...astOfOriginalQuery.where,
        parentheses: true,
      },
      right: {
        ...astOfDummy.where,
        parentheses: true,
      },
    };
    const newAst = {
      ...astOfOriginalQuery,
      where: newWhereClause,
    };
    const sql = parser.sqlify(newAst);
    const quotedSql = sql.replace(/`/g, '"');
    return quotedSql;
  } else {
    const newAst = {
      ...astOfOriginalQuery,
      where: astOfDummy.where,
    };
    const sql = parser.sqlify(newAst);
    const quotedSql = sql.replace(/`/g, '"');
    return quotedSql;
  }
};

export const addLabelToSQlQuery = async (
  originalQuery: any,
  label: any,
  value: any,
  operator: any
) => {
  await importSqlParser();

  const ast: any = parser.astify(originalQuery);

  let query = "";
  if (!ast.where) {
    // If there is no WHERE clause, create a new one
    const newWhereClause = {
      type: "binary_expr",
      operator: operator,
      left: {
        type: "column_ref",
        table: null,
        column: label,
      },
      right: {
        type: "string",
        value: value,
      },
    };

    const newAst = {
      ...ast,
      where: newWhereClause,
    };

    const sql = parser.sqlify(newAst);
    const quotedSql = sql.replace(/`/g, '"');
    query = quotedSql;
  } else {
    const newCondition = {
      type: "binary_expr",
      operator: "AND",
      // parentheses: true,
      left: {
        // parentheses: true,
        ...ast.where,
      },
      right: {
        type: "binary_expr",
        operator: operator,
        left: {
          type: "column_ref",
          table: null,
          column: label,
        },
        right: {
          type: "string",
          value: value,
        },
      },
    };

    const newAst = {
      ...ast,
      where: newCondition,
    };

    const sql = parser.sqlify(newAst);
    const quotedSql = sql.replace(/`/g, '"');

    query = quotedSql;
  }

  return query;
};

export const getStreamFromQuery = async (query: any) => {
  await importSqlParser();

  try {
    const ast: any = parser.astify(query);
    return ast?.from[0]?.table || "";
  } catch (e: any) {
    return "";
  }
};

export const addHistogramToQuery = (query: any) => {
  const parser = new Parser();
  try {
    const ast: any = parser.astify(query); // Parse the SQL query

    // Check if the query selects the _timestamp field
    for (let column of ast.columns) {
      if (
        column.expr.type === "column_ref" &&
        column.expr.column === "_timestamp"
      ) {
        // If it does, replace it with histogram(_timestamp)
        column.expr = {
          type: "function",
          name: "histogram",
          args: {
            type: "expr_list",
            value: [
              {
                type: "column_ref",
                column: "_timestamp",
              },
            ],
          },
        };
        break;
      }
    }

    // Convert the modified AST back to a SQL query
    const newQuery = parser.sqlify(ast);
    const quotedSql = newQuery.replace(/`/g, '"');

    return quotedSql;
  } catch (error) {
    return query;
  }
};

export const removeHistogramFromQuery = (query: any) => {
  const parser = new Parser();
  try {
    const ast: any = parser.astify(query); // Parse the SQL query

    if (!ast) return query;

    // Iterate over the columns in the query
    for (let column of ast.columns) {
      // If the column is a function and its name is histogram
      if (column.expr.type === "function" && column.expr.name === "histogram") {
        // Replace the function with _timestamp
        column.expr = {
          type: "column_ref",
          column: "_timestamp",
        };
      }
    }

    // Convert the modified AST back to a SQL query
    const newQuery = parser.sqlify(ast);
    const quotedSql = newQuery.replace(/`/g, '"');

    return quotedSql;
  } catch (error) {
    return query;
  }
};
