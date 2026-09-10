// A small, safe arithmetic expression evaluator (no eval, no Function).
// Grammar (right-associative ^, standard precedence):
//   expression := term (('+' | '-') term)*
//   term       := factor (('*' | '/' | '%') factor)*
//   factor     := ('-' | '+') factor | power
//   power      := primary ('^' factor)?
//   primary    := number | constant | function '(' args ')' | '(' expression ')'

const FUNCTIONS = {
  sqrt: (x) => Math.sqrt(x),
  cbrt: (x) => Math.cbrt(x),
  abs: (x) => Math.abs(x),
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  tan: (x) => Math.tan(x),
  asin: (x) => Math.asin(x),
  acos: (x) => Math.acos(x),
  atan: (x) => Math.atan(x),
  log: (x) => Math.log10(x),
  ln: (x) => Math.log(x),
  log2: (x) => Math.log2(x),
  exp: (x) => Math.exp(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  round: (x) => Math.round(x),
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
  pow: (x, y) => Math.pow(x, y),
};

const CONSTANTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };
const MAX_EXPRESSION_CHARS = 500;

function tokenize(expression) {
  const tokens = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < expression.length && /[0-9.]/.test(expression[i])) num += expression[i++];
      if (expression[i] === 'e' || expression[i] === 'E') {
        let j = i + 1;
        if (expression[j] === '+' || expression[j] === '-') j += 1;
        if (/[0-9]/.test(expression[j] || '')) {
          num += expression[i++];
          if (expression[i] === '+' || expression[i] === '-') num += expression[i++];
          while (i < expression.length && /[0-9]/.test(expression[i])) num += expression[i++];
        }
      }
      const value = Number(num);
      if (!Number.isFinite(value)) throw new Error(`Invalid number "${num}" in expression.`);
      tokens.push({ type: 'number', value });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let name = '';
      while (i < expression.length && /[a-zA-Z_0-9]/.test(expression[i])) name += expression[i++];
      tokens.push({ type: 'name', value: name });
      continue;
    }
    if ('+-*/%^(),'.includes(ch)) {
      tokens.push({ type: ch });
      i += 1;
      continue;
    }
    throw new Error(`Unexpected character "${ch}" in expression.`);
  }
  return tokens;
}

function makeParser(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = (type) => {
    const token = next();
    if (!token || token.type !== type) throw new Error(`Expected "${type}" but found the end of the expression.`);
    return token;
  };

  function parseExpression() {
    let value = parseTerm();
    while (peek() && (peek().type === '+' || peek().type === '-')) {
      const op = next().type;
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm() {
    let value = parseFactor();
    while (peek() && ['*', '/', '%'].includes(peek().type)) {
      const op = next().type;
      const rhs = parseFactor();
      if (op === '*') value *= rhs;
      else if (op === '/') value /= rhs;
      else {
        if (rhs === 0) throw new Error('Modulo by zero.');
        value %= rhs;
      }
    }
    return value;
  }

  function parseFactor() {
    const token = peek();
    if (token && (token.type === '+' || token.type === '-')) {
      next();
      const value = parseFactor();
      return token.type === '-' ? -value : value;
    }
    return parsePower();
  }

  function parsePower() {
    const base = parsePrimary();
    if (peek() && peek().type === '^') {
      next();
      const exponent = parseFactor();
      return Math.pow(base, exponent);
    }
    return base;
  }

  function parsePrimary() {
    const token = next();
    if (!token) throw new Error('Expression ends unexpectedly.');
    if (token.type === 'number') return token.value;
    if (token.type === '(') {
      const value = parseExpression();
      expect(')');
      return value;
    }
    if (token.type === 'name') {
      const name = token.value;
      if (peek() && peek().type === '(') {
        next();
        const args = [parseExpression()];
        while (peek() && peek().type === ',') {
          next();
          args.push(parseExpression());
        }
        expect(')');
        const fn = FUNCTIONS[name];
        if (!fn) throw new Error(`Unknown function "${name}".`);
        return fn(...args);
      }
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) return CONSTANTS[name];
      throw new Error(`Unknown name "${name}". Supported constants: pi, e, tau.`);
    }
    throw new Error(`Unexpected "${token.type}" in expression.`);
  }

  return () => {
    const value = parseExpression();
    if (peek()) throw new Error(`Unexpected "${peek().type === 'name' ? peek().value : peek().type}" after the expression.`);
    return value;
  };
}

function formatNumber(value) {
  if (!Number.isFinite(value)) throw new Error('The expression does not produce a finite number (check for division by zero).');
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
  return String(Number(value.toPrecision(12)));
}

/**
 * Evaluate an arithmetic expression.
 * Returns { value, formatted } or throws an Error with a readable message.
 */
export function evaluateExpression(raw) {
  const expression = String(raw || '').trim();
  if (!expression) throw new Error('Empty expression.');
  if (expression.length > MAX_EXPRESSION_CHARS) {
    throw new Error(`Expression is too long (max ${MAX_EXPRESSION_CHARS} characters).`);
  }
  const tokens = tokenize(expression);
  if (tokens.length === 0) throw new Error('Empty expression.');
  const value = makeParser(tokens)();
  return { value, formatted: formatNumber(value) };
}
