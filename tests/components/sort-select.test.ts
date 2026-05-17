import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type PlainElement = {
  type: string;
  props: Record<string, unknown> & {
    children?: PlainElement[];
    onChange?: (event: { target: { value: string } }) => void;
  };
  key?: unknown;
};

let currentSort: 'newest' | 'oldest' = 'newest';
let parserOptions: Record<string, unknown> | null = null;
let parseLiteralValues: readonly string[] | null = null;
const useQueryStateCalls: Array<{ key: string; parser: unknown }> = [];
const setCurrentMock = mock.fn(async () => undefined);

function makeElement(type: string, props: Record<string, unknown>, key?: unknown): PlainElement {
  return { type, props, key };
}

mock.module('react', {
  namedExports: {
    useCallback: <Callback extends (...args: never[]) => unknown>(callback: Callback) => callback,
  },
});

mock.module('react/jsx-runtime', {
  namedExports: {
    Fragment: 'Fragment',
    jsx: makeElement,
    jsxs: makeElement,
  },
});

mock.module('react/jsx-dev-runtime', {
  namedExports: {
    Fragment: 'Fragment',
    jsxDEV: makeElement,
  },
});

mock.module('nuqs', {
  namedExports: {
    parseAsStringLiteral: (values: readonly string[]) => {
      parseLiteralValues = values;
      return {
        withDefault: (defaultValue: string) => ({
          withOptions: (options: Record<string, unknown>) => {
            parserOptions = { ...options, defaultValue };
            return { values, defaultValue, options };
          },
        }),
      };
    },
    useQueryState: (key: string, parser: unknown) => {
      useQueryStateCalls.push({ key, parser });
      return [currentSort, setCurrentMock] as const;
    },
  },
});

mock.module('@/lib/url-query/parsers', {
  namedExports: {
    replaceHistoryNoScrollOptions: { history: 'replace', scroll: false },
  },
});

async function loadComponent(scenario: string) {
  return import(`../../src/components/SortSelect.tsx?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

test.beforeEach(() => {
  currentSort = 'newest';
  parserOptions = null;
  parseLiteralValues = null;
  useQueryStateCalls.length = 0;
  setCurrentMock.mock.resetCalls();
});

test('SortSelect wires the sort query parser and renders labeled options', async () => {
  currentSort = 'oldest';
  const { SortSelect } = await loadComponent('render');
  const element = SortSelect({ labels: { newest: 'Newest', oldest: 'Oldest' } }) as PlainElement;

  assert.equal(element.type, 'select');
  assert.equal(element.props.value, 'oldest');
  assert.deepEqual(parseLiteralValues, ['newest', 'oldest']);
  assert.deepEqual(parserOptions, {
    history: 'replace',
    scroll: false,
    shallow: false,
    defaultValue: 'newest',
  });
  assert.equal(useQueryStateCalls.length, 1);
  assert.equal(useQueryStateCalls[0]?.key, 'sort');

  const options = element.props.children ?? [];
  assert.equal(options.length, 2);
  assert.deepEqual(
    options.map((option) => ({
      type: option.type,
      value: option.props.value,
      label: option.props.children,
    })),
    [
      { type: 'option', value: 'newest', label: 'Newest' },
      { type: 'option', value: 'oldest', label: 'Oldest' },
    ],
  );
});

test('SortSelect stores oldest and clears the query param for newest', async () => {
  const { SortSelect } = await loadComponent('change');
  const element = SortSelect({ labels: { newest: 'Newest', oldest: 'Oldest' } }) as PlainElement;

  element.props.onChange?.({ target: { value: 'oldest' } });
  element.props.onChange?.({ target: { value: 'newest' } });

  assert.equal(setCurrentMock.mock.callCount(), 2);
  assert.deepEqual(setCurrentMock.mock.calls[0]?.arguments, ['oldest']);
  assert.deepEqual(setCurrentMock.mock.calls[1]?.arguments, [null]);
});
