import {
  Kind,
  ObjectTypeDefinitionNode,
  ObjectTypeExtensionNode,
  InterfaceTypeDefinitionNode,
  InterfaceTypeExtensionNode,
  InputObjectTypeDefinitionNode,
  InputObjectTypeExtensionNode,
  FieldDefinitionNode,
  InputValueDefinitionNode,
  EnumTypeDefinitionNode,
  EnumTypeExtensionNode,
  EnumValueDefinitionNode,
  DirectiveDefinitionNode,
  ArgumentNode,
  VariableDefinitionNode,
  OperationDefinitionNode,
  FieldNode,
  DirectiveNode,
  SelectionSetNode,
  FragmentSpreadNode,
} from 'graphql';
import type { SourceLocation, Comment } from 'estree';
import type { AST } from 'eslint';
import { GraphQLESLintRule } from '../types';
import { GraphQLESTreeNode } from '../estree-parser';
import { GraphQLESLintRuleListener } from '../testkit';

const ALPHABETIZE = 'ALPHABETIZE';

const fieldsEnum: ('ObjectTypeDefinition' | 'InterfaceTypeDefinition' | 'InputObjectTypeDefinition')[] = [
  Kind.OBJECT_TYPE_DEFINITION,
  Kind.INTERFACE_TYPE_DEFINITION,
  Kind.INPUT_OBJECT_TYPE_DEFINITION,
];
const valuesEnum: ['EnumTypeDefinition'] = [Kind.ENUM_TYPE_DEFINITION];
const selectionsEnum: ('OperationDefinition' | 'FragmentDefinition')[] = [
  Kind.OPERATION_DEFINITION,
  Kind.FRAGMENT_DEFINITION,
];
const variablesEnum: ['OperationDefinition'] = [Kind.OPERATION_DEFINITION];
const argumentsEnum: ('FieldDefinition' | 'Field' | 'DirectiveDefinition' | 'Directive')[] = [
  Kind.FIELD_DEFINITION,
  Kind.FIELD,
  Kind.DIRECTIVE_DEFINITION,
  Kind.DIRECTIVE,
];

export type AlphabetizeConfig = {
  fields?: typeof fieldsEnum;
  values?: typeof valuesEnum;
  selections?: typeof selectionsEnum;
  variables?: typeof variablesEnum;
  arguments?: typeof argumentsEnum;
};

const rule: GraphQLESLintRule<[AlphabetizeConfig]> = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: {
      category: ['Schema', 'Operations'],
      description: `Enforce arrange in alphabetical order for type fields, enum values, input object fields, operation selections and more.`,
      url: 'https://github.com/dotansimha/graphql-eslint/blob/master/docs/rules/alphabetize.md',
      examples: [
        {
          title: 'Incorrect',
          usage: [{ fields: [Kind.OBJECT_TYPE_DEFINITION] }],
          code: /* GraphQL */ `
            type User {
              password: String
              firstName: String! # should be before "password"
              age: Int # should be before "firstName"
              lastName: String!
            }
          `,
        },
        {
          title: 'Correct',
          usage: [{ fields: [Kind.OBJECT_TYPE_DEFINITION] }],
          code: /* GraphQL */ `
            type User {
              age: Int
              firstName: String!
              lastName: String!
              password: String
            }
          `,
        },
        {
          title: 'Incorrect',
          usage: [{ values: [Kind.ENUM_TYPE_DEFINITION] }],
          code: /* GraphQL */ `
            enum Role {
              SUPER_ADMIN
              ADMIN # should be before "SUPER_ADMIN"
              USER
              GOD # should be before "USER"
            }
          `,
        },
        {
          title: 'Correct',
          usage: [{ values: [Kind.ENUM_TYPE_DEFINITION] }],
          code: /* GraphQL */ `
            enum Role {
              ADMIN
              GOD
              SUPER_ADMIN
              USER
            }
          `,
        },
        {
          title: 'Incorrect',
          usage: [{ selections: [Kind.OPERATION_DEFINITION] }],
          code: /* GraphQL */ `
            query {
              me {
                firstName
                lastName
                email # should be before "lastName"
              }
            }
          `,
        },
        {
          title: 'Correct',
          usage: [{ selections: [Kind.OPERATION_DEFINITION] }],
          code: /* GraphQL */ `
            query {
              me {
                email
                firstName
                lastName
              }
            }
          `,
        },
      ],
      configOptions: {
        schema: [
          {
            fields: fieldsEnum,
            values: valuesEnum,
            arguments: argumentsEnum,
          },
        ],
        operations: [
          {
            selections: selectionsEnum,
            variables: variablesEnum,
            arguments: [Kind.FIELD, Kind.DIRECTIVE],
          },
        ],
      },
    },
    messages: {
      [ALPHABETIZE]: '"{{ currName }}" should be before "{{ prevName }}"',
    },
    schema: {
      type: 'array',
      minItems: 1,
      maxItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: {
          fields: {
            type: 'array',
            uniqueItems: true,
            minItems: 1,
            items: {
              enum: fieldsEnum,
            },
            description: 'Fields of `type`, `interface`, and `input`',
          },
          values: {
            type: 'array',
            uniqueItems: true,
            minItems: 1,
            items: {
              enum: valuesEnum,
            },
            description: 'Values of `enum`',
          },
          selections: {
            type: 'array',
            uniqueItems: true,
            minItems: 1,
            items: {
              enum: selectionsEnum,
            },
            description: 'Selections of operations (`query`, `mutation` and `subscription`) and `fragment`',
          },
          variables: {
            type: 'array',
            uniqueItems: true,
            minItems: 1,
            items: {
              enum: variablesEnum,
            },
            description: 'Variables of operations (`query`, `mutation` and `subscription`)',
          },
          arguments: {
            type: 'array',
            uniqueItems: true,
            minItems: 1,
            items: {
              enum: argumentsEnum,
            },
            description: 'Arguments of fields and directives',
          },
        },
      },
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();

    function isNodeAndCommentOnSameLine(node: { loc: SourceLocation }, comment: Comment): boolean {
      return node.loc.end.line === comment.loc.start.line;
    }

    function getBeforeComments(node): Comment[] {
      const commentsBefore = sourceCode.getCommentsBefore(node);
      if (commentsBefore.length === 0) {
        return [];
      }
      const tokenBefore = sourceCode.getTokenBefore(node);
      if (tokenBefore) {
        return commentsBefore.filter(comment => !isNodeAndCommentOnSameLine(tokenBefore, comment));
      }
      return commentsBefore;
    }

    function getRangeWithComments(node): AST.Range {
      const [firstBeforeComment] = getBeforeComments(node);
      const [firstAfterComment] = sourceCode.getCommentsAfter(node);
      const from = firstBeforeComment || node;
      const to = firstAfterComment && isNodeAndCommentOnSameLine(node, firstAfterComment) ? firstAfterComment : node;
      return [from.range[0], to.range[1]];
    }

    function checkNodes(
      nodes: GraphQLESTreeNode<
        | FieldDefinitionNode
        | InputValueDefinitionNode
        | EnumValueDefinitionNode
        | FieldNode
        | FragmentSpreadNode
        | ArgumentNode
        | VariableDefinitionNode['variable']
      >[]
    ) {
      // Starts from 1, ignore nodes.length <= 1
      for (let i = 1; i < nodes.length; i += 1) {
        const prevNode = nodes[i - 1];
        const currNode = nodes[i];
        const prevName = prevNode.name.value;
        const currName = currNode.name.value;
        // Compare with lexicographic order
        if (prevName.localeCompare(currName) !== 1) {
          continue;
        }
        const isVariableNode = currNode.kind === Kind.VARIABLE;
        context.report({
          node: currNode.name,
          messageId: ALPHABETIZE,
          data: isVariableNode
            ? {
                currName: `$${currName}`,
                prevName: `$${prevName}`,
              }
            : { currName, prevName },
          *fix(fixer) {
            const prevRange = getRangeWithComments(prevNode);
            const currRange = getRangeWithComments(currNode);
            yield fixer.replaceTextRange(prevRange, sourceCode.getText({ range: currRange } as any));
            yield fixer.replaceTextRange(currRange, sourceCode.getText({ range: prevRange } as any));
          },
        });
      }
    }

    const opts = context.options[0];
    const fields = new Set(opts.fields ?? []);
    const listeners: GraphQLESLintRuleListener = {};

    const kinds = [
      fields.has(Kind.OBJECT_TYPE_DEFINITION) && [Kind.OBJECT_TYPE_DEFINITION, Kind.OBJECT_TYPE_EXTENSION],
      fields.has(Kind.INTERFACE_TYPE_DEFINITION) && [Kind.INTERFACE_TYPE_DEFINITION, Kind.INTERFACE_TYPE_EXTENSION],
      fields.has(Kind.INPUT_OBJECT_TYPE_DEFINITION) && [
        Kind.INPUT_OBJECT_TYPE_DEFINITION,
        Kind.INPUT_OBJECT_TYPE_EXTENSION,
      ],
    ]
      .filter(Boolean)
      .flat();

    const fieldsSelector = kinds.join(',');

    const hasEnumValues = opts.values?.[0] === Kind.ENUM_TYPE_DEFINITION;
    const selectionsSelector = opts.selections?.join(',');
    const hasVariables = opts.variables?.[0] === Kind.OPERATION_DEFINITION;
    const argumentsSelector = opts.arguments?.join(',');

    if (fieldsSelector) {
      listeners[fieldsSelector] = (
        node: GraphQLESTreeNode<
          | ObjectTypeDefinitionNode
          | ObjectTypeExtensionNode
          | InterfaceTypeDefinitionNode
          | InterfaceTypeExtensionNode
          | InputObjectTypeDefinitionNode
          | InputObjectTypeExtensionNode
        >
      ) => {
        checkNodes(node.fields);
      };
    }

    if (hasEnumValues) {
      const enumValuesSelector = [Kind.ENUM_TYPE_DEFINITION, Kind.ENUM_TYPE_EXTENSION].join(',');
      listeners[enumValuesSelector] = (node: GraphQLESTreeNode<EnumTypeDefinitionNode | EnumTypeExtensionNode>) => {
        checkNodes(node.values);
      };
    }

    if (selectionsSelector) {
      listeners[`:matches(${selectionsSelector}) SelectionSet`] = (node: GraphQLESTreeNode<SelectionSetNode>) => {
        checkNodes(
          node.selections
            // inline fragment don't have name, so we skip them
            .filter(selection => selection.kind !== Kind.INLINE_FRAGMENT)
            .map(selection =>
              // sort by alias is field is renamed
              'alias' in selection && selection.alias ? ({ name: selection.alias } as any) : selection
            )
        );
      };
    }

    if (hasVariables) {
      listeners.OperationDefinition = (node: GraphQLESTreeNode<OperationDefinitionNode>) => {
        checkNodes(node.variableDefinitions.map(varDef => varDef.variable));
      };
    }

    if (argumentsSelector) {
      listeners[argumentsSelector] = (
        node: GraphQLESTreeNode<FieldDefinitionNode | FieldNode | DirectiveDefinitionNode | DirectiveNode>
      ) => {
        checkNodes(node.arguments);
      };
    }

    return listeners;
  },
};

export default rule;
