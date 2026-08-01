/**
 * Formula-engine regression tests.  npm run test:formulas
 *
 * Expected values are taken from Excel / Google Sheets semantics, not from
 * whatever the implementation happens to return — several of these caught real
 * bugs when first written.
 */
import { evaluateFormula } from "../src/lib/sheets/formula";
import type { CellValue } from "../src/lib/sheets/formula";

// A small sheet: A1:C7 is a product table, E1:F3 a criteria block.
const grid: Record<string, CellValue> = {
  "0:0": "Item",   "0:1": "Region", "0:2": "Sales",
  "1:0": "Widget", "1:1": "EMEA",   "1:2": 100,
  "2:0": "Gadget", "2:1": "EMEA",   "2:2": 250,
  "3:0": "Widget", "3:1": "APAC",   "3:2": 400,
  "4:0": "Gizmo",  "4:1": "APAC",   "4:2": 50,
  "5:0": "Gadget", "5:1": "EMEA",   "5:2": 300,
  // criteria block E1:E2  (col 4)
  "0:4": "Region", "1:4": "EMEA",
  // sorted lookup vector H1:H4 (col 7) + result vector I (col 8)
  "0:7": 10, "1:7": 20, "2:7": 30, "3:7": 40,
  "0:8": "ten", "1:8": "twenty", "2:8": "thirty", "3:8": "forty",
  // cash flows K1:K4 (col 10)
  "0:10": -1000, "1:10": 400, "2:10": 400, "3:10": 400,
};
const getter = (r: number, c: number): CellValue => grid[`${r}:${c}`] ?? null;

let pass = 0, fail = 0;
const approx = (a: unknown, b: number, tol = 1e-6) =>
  typeof a === "number" && Math.abs(a - b) < tol;

function t(formula: string, expected: unknown, tol?: number) {
  const got = evaluateFormula(formula, getter);
  const ok = typeof expected === "number" && tol !== undefined
    ? approx(got, expected, tol)
    : typeof expected === "number"
      ? approx(got, expected)
      : JSON.stringify(got) === JSON.stringify(expected);
  if (ok) { pass++; }
  else { fail++; console.log(`  ✗ ${formula}\n      got ${JSON.stringify(got)}  want ${JSON.stringify(expected)}`); }
}

console.log("Logical constants");
t("=TRUE()", true); t("=FALSE()", false); t("=IF(TRUE(),1,2)", 1);

console.log("Statistical");
t("=AVERAGEIFS(C2:C6,B2:B6,\"EMEA\")", (100 + 250 + 300) / 3);
t("=PERCENTILE(C2:C6,0)", 50);
t("=PERCENTILE(C2:C6,1)", 400);
t("=PERCENTILE(C2:C6,0.5)", 250);      // median of 50,100,250,300,400
t("=QUARTILE(C2:C6,2)", 250);
t("=QUARTILE(C2:C6,0)", 50);
t("=QUARTILE(C2:C6,4)", 400);

console.log("Lookup");
t("=LOOKUP(25,H1:H4,I1:I4)", "twenty");  // last value <= 25
t("=LOOKUP(40,H1:H4,I1:I4)", "forty");
t("=LOOKUP(5,H1:H4,I1:I4)", "#N/A");
t("=XMATCH(30,H1:H4)", 3);
t("=XMATCH(25,H1:H4,-1)", 2);            // next smaller
t("=XMATCH(25,H1:H4,1)", 3);             // next larger
t("=XMATCH(99,H1:H4)", "#N/A");

console.log("Financial");
t("=SLN(10000,1000,5)", 1800);
t("=IRR(K1:K4)", 0.09701, 1e-4);          // -1000, 400, 400, 400
t("=DDB(10000,1000,5,1)", 4000);          // 2/5 of 10000
t("=DDB(10000,1000,5,2)", 2400);          // 2/5 of remaining 6000
// IPMT + PPMT must reconstruct the full payment
const ip = evaluateFormula("=IPMT(0.05,1,10,10000)", getter) as number;
const pp = evaluateFormula("=PPMT(0.05,1,10,10000)", getter) as number;
const pm = evaluateFormula("=PMT(0.05,10,10000)", getter) as number;
if (typeof ip === "number" && typeof pp === "number" && typeof pm === "number"
    && Math.abs((ip + pp) - pm) < 1e-6) { pass++; }
else { fail++; console.log(`  ✗ IPMT+PPMT should equal PMT — got ${ip}+${pp}=${ip + pp} vs ${pm}`); }
// First period interest on 10000 at 5% is exactly -500
if (approx(ip, -500, 1e-6)) pass++; else { fail++; console.log(`  ✗ IPMT period 1 want -500, got ${ip}`); }

console.log("Database");
t("=DSUM(A1:C6,\"Sales\",E1:E2)", 650);       // EMEA rows: 100+250+300
t("=DCOUNT(A1:C6,\"Sales\",E1:E2)", 3);
t("=DAVERAGE(A1:C6,\"Sales\",E1:E2)", 650 / 3);
t("=DMAX(A1:C6,\"Sales\",E1:E2)", 300);
t("=DMIN(A1:C6,\"Sales\",E1:E2)", 100);
t("=DSUM(A1:C6,3,E1:E2)", 650);               // field by 1-based index

console.log("Engineering");
t("=DECIMAL(\"FF\",16)", 255);
t("=DECIMAL(\"1010\",2)", 10);
t("=BASE(255,16)", "FF");
t("=BASE(5,2,8)", "00000101");
t("=HEX2DEC(\"FF\")", 255);
t("=BIN2DEC(\"1010\")", 10);
t("=OCT2DEC(\"17\")", 15);
t("=BIN2DEC(\"1111111111\")", -1);            // two's complement
t("=CONVERT(1,\"km\",\"m\")", 1000);
t("=CONVERT(1,\"lbm\",\"kg\")", 0.45359237);
t("=CONVERT(100,\"C\",\"F\")", 212);
t("=CONVERT(32,\"F\",\"C\")", 0);
t("=CONVERT(1,\"hr\",\"min\")", 60);
t("=CONVERT(1,\"km\",\"kg\")", "#N/A");        // cross-family is an error

console.log("Date");
t("=SECOND(\"1/1/2026 10:30:45\")", 45);
t("=WORKDAY(\"1/2/2026\",1)", "1/5/2026");     // Fri +1 workday -> Mon

console.log("Regression: existing functions still work");
t("=SUM(C2:C6)", 1100);
t("=VLOOKUP(\"Gizmo\",A1:C6,3,FALSE)", 50);
t("=COUNTIF(B2:B6,\"EMEA\")", 3);
t("=IFERROR(1/0,\"err\")", "err");

console.log("Lambda family");
// LET
t("=LET(x,5,x*2)", 10);
t("=LET(x,5,y,3,x+y)", 8);
t("=LET(a,2,b,a*3,b+1)", 7);              // later binding sees the earlier one
t("=LET(x,SUM(C2:C6),x/2)", 550);         // value may be a formula
t("=LET(x,1)", "#VALUE!");                // too few args
t("=LET(1,2,3)", "#NAME?");               // invalid variable name

// MAP
t("=MAP(H1:H4,LAMBDA(v,v*2))", { __spill: true, values: [[20],[40],[60],[80]] });
t("=SUM(MAP(H1:H4,LAMBDA(v,v*2)))", 200);
t("=MAP(C2:C6,LAMBDA(v,IF(v>200,1,0)))",
  { __spill: true, values: [[0],[1],[1],[0],[1]] });

// REDUCE
t("=REDUCE(0,H1:H4,LAMBDA(acc,v,acc+v))", 100);
t("=REDUCE(1,H1:H4,LAMBDA(acc,v,acc*v))", 240000);
t("=REDUCE(0,C2:C6,LAMBDA(acc,v,acc+v))", 1100);

// SCAN — running total
t("=SCAN(0,H1:H4,LAMBDA(acc,v,acc+v))",
  { __spill: true, values: [[10],[30],[60],[100]] });

// Immediate invocation, including a nested call in the body
t("=LAMBDA(x,x*2)(5)", 10);
t("=LAMBDA(x,y,x+y)(3,4)", 7);
t("=LAMBDA(x,SUM(x,1))(2)", 3);
t("=LAMBDA(x,x*2)", "#VALUE!");           // unapplied lambda is not a value

// Scope hygiene: a binding must not leak into the next evaluation
t("=LET(zz,9,zz)", 9);
t("=SUM(C2:C6)", 1100);                   // zz is gone; nothing shadowed

// Variables must not shadow real cell refs unless bound
t("=LET(q,1,q)+C2", 101);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
