import type { ExplanationCategory } from '../../feynman/classifier'

/**
 * NLP-1: hand-authored + seeded labeled set for comparing the rule-based
 * classifier (src/lib/feynman/classifier.ts) against the LLM grader (NLP-2/3).
 *
 * `humanLabel` is the ground truth. `adversarial` marks examples deliberately
 * written to expose a known failure mode of the keyword-based rule classifier
 * (a meaning marker used in a purely procedural sentence, a genuine real-world
 * connection made without any of the trigger words, or a long non-answer that
 * contains no uncertainty marker) — these are the cases most likely to separate
 * the two graders' agreement scores.
 */
export interface LabeledExample {
  id: string
  concept: string
  text: string
  humanLabel: ExplanationCategory
  adversarial?: boolean
  note?: string
}

export const LABELED_EXAMPLES: LabeledExample[] = [
  // ---- seeded from src/lib/feynman/classifier.test.ts (P1-1) ----
  {
    id: 'seed-01',
    concept: 'Integration — Basics',
    text: 'To integrate x to the power n, you add 1 to the power and then divide by the new power. First you apply that rule, then simplify.',
    humanLabel: 'method-only',
  },
  {
    id: 'seed-02',
    concept: 'Integration — Basics',
    text: "Imagine Virat Kohli's run rate changes every over — sometimes 12 runs per over, sometimes 4. Differentiation would tell you the rate at any specific over. Integration adds all of those up to give you the total runs scored. You're going backwards from rate to total.",
    humanLabel: 'meaning-included',
  },
  {
    id: 'seed-03',
    concept: 'Integration — Basics',
    text: "I'm not sure, maybe it just reverses the other thing somehow?",
    humanLabel: 'gap',
  },
  {
    id: 'seed-04',
    concept: 'Differentiation — Rules',
    text: 'It reverses differentiation.',
    humanLabel: 'gap',
  },
  {
    id: 'seed-05',
    concept: 'Integration — Basics',
    text: 'Integration is finding the area under the curve of a function using the standard formula.',
    humanLabel: 'meaning-included',
    note: 'ambiguous edge case retained from classifier.test.ts — bare procedural description that merely mentions "area under"',
  },

  // ---- gap: too short ----
  { id: 'gap-06', concept: 'Differentiation — Rules', text: 'Differentiation finds slope.', humanLabel: 'gap' },
  { id: 'gap-07', concept: 'Vectors', text: 'Vectors have magnitude and direction.', humanLabel: 'gap' },
  { id: 'gap-08', concept: 'Matrices', text: "It's just a rule you apply.", humanLabel: 'gap' },
  { id: 'gap-09', concept: 'Sets and Relations', text: 'Sets are groups of things.', humanLabel: 'gap' },
  { id: 'gap-10', concept: 'Circles', text: 'Circles have a center and radius.', humanLabel: 'gap' },

  // ---- gap: hedged/uncertain ----
  { id: 'gap-11', concept: 'Limits', text: "I don't really know, maybe it's like reversing something?", humanLabel: 'gap' },
  { id: 'gap-12', concept: 'Integration — Basics', text: 'Not sure honestly, integration is confusing.', humanLabel: 'gap' },
  { id: 'gap-13', concept: 'Continuity', text: "I'm confused about what continuity even means at a point.", humanLabel: 'gap' },
  { id: 'gap-14', concept: 'Permutations and Combinations', text: 'Not really sure how permutations work honestly.', humanLabel: 'gap' },
  { id: 'gap-15', concept: 'Probability', text: 'Probability is about chances I think, not confident on the rest.', humanLabel: 'gap' },
  { id: 'gap-16', concept: 'Matrices', text: "Matrices are grids of numbers, not sure what else to say.", humanLabel: 'gap' },
  { id: 'gap-17', concept: 'Complex Numbers', text: 'I guess complex numbers have i in them somehow, not confident.', humanLabel: 'gap' },
  { id: 'gap-18', concept: 'Binomial Theorem', text: 'No idea what binomial theorem is even for honestly.', humanLabel: 'gap' },
  { id: 'gap-19', concept: 'Sequences and Series', text: "Sequences are numbers in order, that's all I really know.", humanLabel: 'gap' },
  { id: 'gap-20', concept: 'Straight Lines', text: "Straight lines have slope, I'm not confident about the rest.", humanLabel: 'gap' },
  { id: 'gap-21', concept: 'Differential Equations', text: "I don't know, differential equations feel too abstract for me.", humanLabel: 'gap' },
  { id: 'gap-22', concept: 'Quadratic Equations', text: 'Quadratic equations, not confident, something about roots I think.', humanLabel: 'gap' },
  { id: 'gap-23', concept: 'Sets and Relations', text: "Sets and relations, I don't really know the difference honestly.", humanLabel: 'gap' },
  { id: 'gap-24', concept: 'Binomial Theorem', text: 'Binomial theorem, no idea how the coefficients work.', humanLabel: 'gap' },
  { id: 'gap-25', concept: 'Integration — Basics', text: "I don't know honestly, can we just skip this one?", humanLabel: 'gap' },
  { id: 'gap-26', concept: 'Chain Rule', text: 'Not sure, this whole chapter confuses me a lot.', humanLabel: 'gap' },
  { id: 'gap-27', concept: 'Functions — Basics', text: "No idea, I guess it's some kind of formula thing.", humanLabel: 'gap' },
  { id: 'gap-28', concept: 'Vectors', text: 'Vectors confuse me completely, I really don’t get the notation.', humanLabel: 'gap' },

  // ---- gap: adversarial — long enough, no uncertainty marker, no meaning/method
  // marker, but still says nothing about the concept itself. The rule classifier's
  // default branch calls anything this long without markers "method-only". ----
  {
    id: 'gap-29',
    concept: 'Integration — Basics',
    text: 'Integration is one of those topics in calculus that comes up a lot in JEE and you need to practice it regularly to get better at it.',
    humanLabel: 'gap',
    adversarial: true,
    note: 'no uncertainty marker, no meaning/method marker, length >= 8 words — rule classifier default falls through to method-only',
  },
  {
    id: 'gap-30',
    concept: 'Chain Rule',
    text: "Chain rule is something we covered in class last week and I've been practicing a bunch of problems on it since then.",
    humanLabel: 'gap',
    adversarial: true,
    note: 'says nothing about what chain rule is; rule classifier misses this because no marker fires',
  },
  {
    id: 'gap-31',
    concept: 'Vectors',
    text: 'Vectors show up everywhere in physics and math and this chapter has a lot of formulas to remember for the exam.',
    humanLabel: 'gap',
    adversarial: true,
  },
  {
    id: 'gap-32',
    concept: 'Probability',
    text: "Probability is a whole chapter with many sub-topics and I've been going through the NCERT examples one by one.",
    humanLabel: 'gap',
    adversarial: true,
  },
  {
    id: 'gap-33',
    concept: 'Differential Equations',
    text: "Differential equations is honestly one of the harder chapters and I still need more practice before I'm comfortable with it.",
    humanLabel: 'gap',
    adversarial: true,
  },
  {
    id: 'gap-34',
    concept: 'Trigonometric Identities',
    text: 'Trigonometric identities are hard, I keep mixing all of them up whenever I try to use them in a problem.',
    humanLabel: 'gap',
    adversarial: true,
    note: '"hard" and "mixing up" are not in UNCERTAINTY_MARKERS — rule classifier misses the hedge entirely',
  },

  // ---- method-only ----
  { id: 'method-35', concept: 'Differentiation — Rules', text: "You bring the power down in front, then subtract one from the power. That's basically the whole rule for differentiating a term.", humanLabel: 'method-only' },
  { id: 'method-36', concept: 'Chain Rule', text: 'First you differentiate the outer function keeping the inside the same, then multiply by the derivative of the inside function.', humanLabel: 'method-only' },
  { id: 'method-37', concept: 'Limits', text: 'You substitute the value directly into the function. If it gives an undefined form, you factor and cancel, then substitute again.', humanLabel: 'method-only' },
  { id: 'method-38', concept: 'Quadratic Equations', text: 'You use the formula, minus b plus or minus root of b squared minus four a c, all divided by two a, and plug in the values.', humanLabel: 'method-only' },
  { id: 'method-39', concept: 'Probability', text: 'You count the favorable outcomes, count the total number of outcomes, and divide one by the other to get the answer.', humanLabel: 'method-only', adversarial: true, note: '"total" marker fires but this is purely procedural, not meaning' },
  { id: 'method-40', concept: 'Vectors', text: 'You take the dot product by multiplying corresponding components and adding them, following the standard steps in order.', humanLabel: 'method-only' },
  { id: 'method-41', concept: 'Matrices', text: 'You multiply each row of the first matrix by each column of the second, add up the products, and place the result in the new matrix.', humanLabel: 'method-only' },
  { id: 'method-42', concept: 'Complex Numbers', text: 'You multiply the numerator and denominator by the conjugate, expand everything out, then simplify to separate the real and imaginary parts.', humanLabel: 'method-only' },
  { id: 'method-43', concept: 'Trigonometric Identities', text: 'You substitute the identity into the equation, expand the brackets, then combine like terms following the steps we practiced.', humanLabel: 'method-only' },
  { id: 'method-44', concept: 'Permutations and Combinations', text: 'You use n factorial divided by n minus r factorial for permutations, plug in the numbers, and calculate the result.', humanLabel: 'method-only' },
  { id: 'method-45', concept: 'Sequences and Series', text: 'You find the common difference, apply the nth term formula, and substitute n to get the answer.', humanLabel: 'method-only' },
  { id: 'method-46', concept: 'Straight Lines', text: 'You use the two-point formula, subtract the y coordinates over the x coordinates, and that gives you the slope.', humanLabel: 'method-only' },
  { id: 'method-47', concept: 'Circles', text: 'You complete the square for the x and y terms, rearrange the equation, and read off the center and radius.', humanLabel: 'method-only' },
  { id: 'method-48', concept: 'Sets and Relations', text: 'You list the elements of each set, compare them, and apply the union or intersection rule as needed.', humanLabel: 'method-only' },
  { id: 'method-49', concept: 'Binomial Theorem', text: 'You use the formula with n choose r, multiply by the powers of each term, and expand it term by term.', humanLabel: 'method-only' },
  { id: 'method-50', concept: 'Definite Integrals', text: 'You find the antiderivative, plug in the upper limit, plug in the lower limit, then subtract the second from the first.', humanLabel: 'method-only' },
  { id: 'method-51', concept: 'Integration by Parts', text: 'You pick u and dv following the LIATE order, apply the formula, then integrate whatever is left over.', humanLabel: 'method-only' },
  { id: 'method-52', concept: 'Differential Equations', text: 'You separate the variables so all the x terms are on one side and y terms on the other, then integrate both sides.', humanLabel: 'method-only' },
  { id: 'method-53', concept: 'Continuity', text: 'You check if the left-hand limit equals the right-hand limit equals the value of the function at that point.', humanLabel: 'method-only' },
  {
    id: 'method-54',
    concept: 'Integration — Basics',
    text: 'First you find the sum of the areas of small rectangles, then you apply the standard formula, then you simplify the terms.',
    humanLabel: 'method-only',
    adversarial: true,
    note: '"sum of" marker fires but this only narrates the Riemann-sum procedure, never says what the result means',
  },
  {
    id: 'method-55',
    concept: 'Quadratic Equations',
    text: 'The formula gives you the total when you plug in the numbers, then you just calculate step by step like we practiced.',
    humanLabel: 'method-only',
    adversarial: true,
    note: '"total" marker fires on a purely mechanical description',
  },
  {
    id: 'method-56',
    concept: 'Trigonometric Identities',
    text: 'Because the rule says to multiply first, you multiply first, then you add the constant at the end of the calculation.',
    humanLabel: 'method-only',
    adversarial: true,
    note: '"because" marker fires but the clause is circular procedure, not real-world meaning',
  },
  {
    id: 'method-57',
    concept: 'Limits',
    text: "That's why you always check the denominator isn't zero before you plug in and calculate the rest of the steps.",
    humanLabel: 'method-only',
    adversarial: true,
    note: '"that\'s why" marker fires but no meaning is actually conveyed, just a procedural caveat',
  },
  {
    id: 'method-58',
    concept: 'Quadratic Equations',
    text: 'The overall steps are: differentiate, set it to zero, then solve for x using the quadratic formula.',
    humanLabel: 'method-only',
    adversarial: true,
    note: '"overall" marker fires on a step list',
  },
  {
    id: 'method-59',
    concept: 'Trigonometric Identities',
    text: 'In practice you just follow the formula sheet, plug in the given values, and compute the final numeric answer.',
    humanLabel: 'method-only',
    adversarial: true,
    note: '"in practice" marker fires but describes exam-taking mechanics, not the concept\'s meaning',
  },
  { id: 'method-60', concept: 'Matrices', text: 'You find the determinant using the standard cofactor expansion, then use it to check if the inverse exists.', humanLabel: 'method-only' },
  { id: 'method-61', concept: 'Vectors', text: 'You use the cross product formula with the determinant of the unit vectors and components, then simplify the expression.', humanLabel: 'method-only' },
  { id: 'method-62', concept: 'Quadratic Equations', text: 'You factor the expression into two brackets, set each bracket to zero, and solve for the two values of x.', humanLabel: 'method-only' },
  { id: 'method-63', concept: 'Trigonometric Identities', text: 'You draw the triangle, label the sides, then apply the formula for sine or cosine depending on which one is asked.', humanLabel: 'method-only' },
  { id: 'method-64', concept: 'Probability', text: 'You use the combination formula for the numerator and denominator separately, then divide to get the final probability value.', humanLabel: 'method-only' },
  { id: 'method-65', concept: 'Limits', text: 'You rationalize the expression by multiplying with the conjugate, cancel the common terms, then substitute the limit value.', humanLabel: 'method-only' },
  { id: 'method-66', concept: 'Sequences and Series', text: 'You write out the first few terms, spot the pattern in the ratio, then use the formula for a geometric series.', humanLabel: 'method-only' },
  { id: 'method-67', concept: 'Sets and Relations', text: 'You draw a Venn diagram, shade the required region, then count the elements to get the final answer.', humanLabel: 'method-only' },
  { id: 'method-68', concept: 'Circles', text: 'You use the general equation, compare coefficients with the standard form, then solve for g, f, and c.', humanLabel: 'method-only' },
  { id: 'method-69', concept: 'Differential Equations', text: "You identify whether it's linear or separable first, then apply the matching method and integrate to find the solution.", humanLabel: 'method-only' },
  { id: 'method-70', concept: 'Functions — Basics', text: 'You check the domain, check if each input maps to exactly one output, then confirm it satisfies the vertical line test.', humanLabel: 'method-only' },

  // ---- meaning-included ----
  { id: 'meaning-71', concept: 'Differentiation — Rules', text: "Imagine you're checking your speedometer in a car — differentiation tells you how fast your position is changing at that exact instant, not your average speed.", humanLabel: 'meaning-included' },
  { id: 'meaning-72', concept: 'Chain Rule', text: 'Think of it like nested boxes — if your salary depends on hours worked, and hours worked depends on the day of the week, chain rule tells you how salary changes as the day changes, layer by layer.', humanLabel: 'meaning-included' },
  { id: 'meaning-73', concept: 'Limits', text: "A limit is like watching a batsman's strike rate as he faces more and more balls — you want to know where it's heading even if he never actually reaches that exact number.", humanLabel: 'meaning-included' },
  { id: 'meaning-74', concept: 'Quadratic Equations', text: 'The roots of a quadratic are basically the points where a thrown ball would hit the ground — the equation models the height over time, and solving it tells you where it lands.', humanLabel: 'meaning-included' },
  { id: 'meaning-75', concept: 'Probability', text: "It's like predicting whether India wins the toss — you're not certain, but probability gives you a real-world estimate based on how many ways each outcome can happen.", humanLabel: 'meaning-included' },
  { id: 'meaning-76', concept: 'Vectors', text: 'A vector is like giving someone directions to a shop — you need both the distance and which way to walk, that’s magnitude and direction together.', humanLabel: 'meaning-included' },
  { id: 'meaning-77', concept: 'Matrices', text: 'Matrices are basically how a video game stores the positions of every character on screen at once, so you can move or rotate all of them together in one step.', humanLabel: 'meaning-included' },
  { id: 'meaning-78', concept: 'Complex Numbers', text: "Complex numbers let you solve problems that don't have a real answer, like in electrical engineering where they're used to represent the phase of an alternating current.", humanLabel: 'meaning-included' },
  { id: 'meaning-79', concept: 'Trigonometric Identities', text: 'These identities are why a ladder problem works — they let you switch between the angle and the side lengths so you can figure out how high the ladder actually reaches.', humanLabel: 'meaning-included' },
  { id: 'meaning-80', concept: 'Permutations and Combinations', text: "This is literally how you'd figure out how many different batting orders a cricket team could have for eleven players — the situation decides whether order matters or not.", humanLabel: 'meaning-included' },
  { id: 'meaning-81', concept: 'Sequences and Series', text: "A geometric series is why compound interest grows the way it does in your bank account — each year's amount depends on the previous one, and adding them all up gives your total savings.", humanLabel: 'meaning-included' },
  { id: 'meaning-82', concept: 'Straight Lines', text: "Slope is basically how steep a ramp feels when you're walking up it — a bigger slope means you gain height faster for the same distance forward.", humanLabel: 'meaning-included' },
  { id: 'meaning-83', concept: 'Circles', text: "The equation of a circle is what a GPS app uses to show you 'restaurants within 2 km' — every point at that fixed distance from you traces out the circle.", humanLabel: 'meaning-included' },
  { id: 'meaning-84', concept: 'Sets and Relations', text: "It's like sorting students into groups for a project — sets let you talk about who's in both groups, only one group, or neither, without listing everyone by name.", humanLabel: 'meaning-included' },
  { id: 'meaning-85', concept: 'Binomial Theorem', text: "This is how you'd calculate the odds in a game where you flip a coin ten times — instead of listing every outcome, the theorem gives you a shortcut for how many ways you get exactly six heads.", humanLabel: 'meaning-included' },
  { id: 'meaning-86', concept: 'Definite Integrals', text: "A definite integral is exactly like calculating the total distance run in a race from the speed graph — you're adding up all the tiny bits of distance covered between the start and finish times.", humanLabel: 'meaning-included' },
  { id: 'meaning-87', concept: 'Integration by Parts', text: "It's useful when two different things are multiplied together and changing at once, like calculating total cost when both price and quantity are changing — you can't just use one simple rule.", humanLabel: 'meaning-included' },
  { id: 'meaning-88', concept: 'Differential Equations', text: 'This models real situations like how fast a cup of tea cools down — the rate of cooling depends on how hot the tea currently is, which is exactly what a differential equation describes.', humanLabel: 'meaning-included' },
  { id: 'meaning-89', concept: 'Continuity', text: "A function being continuous is like drawing a graph without lifting your pen — if there's a jump or hole, that's a real situation where the value changes suddenly and unpredictably.", humanLabel: 'meaning-included' },
  { id: 'meaning-90', concept: 'Chain Rule', text: "Think of ripples in a pond — the ripple's radius grows with time, and the area grows with the radius, so chain rule is how you connect the two rates together.", humanLabel: 'meaning-included' },
  { id: 'meaning-91', concept: 'Quadratic Equations', text: 'In practice a shopkeeper uses this to figure out the price that maximizes profit — the quadratic models profit against price, and the vertex tells you the best price to charge.', humanLabel: 'meaning-included' },
  { id: 'meaning-92', concept: 'Limits', text: "It's like a bus approaching a stop — even if it never reaches speed zero exactly at the door, you can still predict its speed right as it gets there, that's the limit.", humanLabel: 'meaning-included' },
  { id: 'meaning-93', concept: 'Vectors', text: "This is used when a plane's actual path is affected by wind — the plane's heading and the wind's push are two vectors, and adding them gives the real direction it travels.", humanLabel: 'meaning-included' },
  { id: 'meaning-94', concept: 'Trigonometric Identities', text: 'For example, an architect uses these to figure out the height of a building from a shadow’s length and the sun’s angle, without ever climbing up to measure it directly.', humanLabel: 'meaning-included' },
  { id: 'meaning-95', concept: 'Sequences and Series', text: "This is why a viral video's views can explode so fast — if each share leads to more shares, that's a geometric sequence, and the reason growth feels so sudden is because each term depends on the last one.", humanLabel: 'meaning-included' },
  { id: 'meaning-96', concept: 'Sets and Relations', text: "Such as when you're comparing which students are in both the coding club and the debate club — the intersection is exactly that overlap, a real situation you'd actually need to work out.", humanLabel: 'meaning-included' },
  { id: 'meaning-97', concept: 'Circles', text: 'Used when a phone tower needs to cover everyone within a certain range — the coverage area is literally the circle, and the equation tells you exactly who’s inside it.', humanLabel: 'meaning-included' },
  { id: 'meaning-98', concept: 'Complex Numbers', text: "The reason engineers use these for AC circuits is that the imaginary part represents the phase shift, so it's not just abstract math — it's how they design real circuits.", humanLabel: 'meaning-included' },
  {
    id: 'meaning-99',
    concept: 'Differentiation — Rules',
    text: 'A derivative tells you your speed right now on a bike, not your average speed over the whole ride — it’s the instant your speedometer needle shows.',
    humanLabel: 'meaning-included',
    adversarial: true,
    note: 'genuine real-world connection but hits none of MEANING_MARKERS — rule classifier falls through to method-only',
  },
  {
    id: 'meaning-100',
    concept: 'Trigonometric Identities',
    text: "If you're on a Ferris wheel, your height keeps changing at a different rate depending on where you are on the circle — that captures what a derivative of a sine function gives you at each point.",
    humanLabel: 'meaning-included',
    adversarial: true,
    note: 'no marker words present',
  },
  {
    id: 'meaning-101',
    concept: 'Probability',
    text: 'Two dice rolled together have thirty-six possible pairs, and only some of those pairs add up to seven — that ratio is literally your answer once you compute it.',
    humanLabel: 'meaning-included',
    adversarial: true,
    note: 'no marker words present',
  },
  {
    id: 'meaning-102',
    concept: 'Matrices',
    text: 'A matrix rotating a shape on screen is just numbers multiplying coordinates to spin every point by the same angle at once, one operation moving the whole object together.',
    humanLabel: 'meaning-included',
    adversarial: true,
    note: 'no marker words present',
  },
  {
    id: 'meaning-103',
    concept: 'Sequences and Series',
    text: "Compound interest each year multiplies last year's balance by the same rate, and stacking those multiplications together is exactly a geometric sequence in your bank statement.",
    humanLabel: 'meaning-included',
    adversarial: true,
    note: 'no marker words present',
  },
  {
    id: 'meaning-104',
    concept: 'Circles',
    text: "A ladder leaning against a wall traces out one quarter of a circle as it slides down, and the circle's equation is just tracking every position the ladder's top could be.",
    humanLabel: 'meaning-included',
    adversarial: true,
    note: 'no marker words present',
  },
  { id: 'meaning-105', concept: 'Functions — Basics', text: "A function is like a vending machine — for example, put in the same code and you always get the same snack out, that's what makes it a valid function and not just a random mapping.", humanLabel: 'meaning-included' },
  { id: 'meaning-106', concept: 'Binomial Theorem', text: 'The reason this matters in practice is quality control on a factory line — you can estimate how many defective items to expect out of a batch using the same expansion.', humanLabel: 'meaning-included' },
]

export const CATEGORY_COUNTS = LABELED_EXAMPLES.reduce<Record<ExplanationCategory, number>>(
  (acc, ex) => {
    acc[ex.humanLabel] += 1
    return acc
  },
  { 'method-only': 0, 'meaning-included': 0, gap: 0 }
)
