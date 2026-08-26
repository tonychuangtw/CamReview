/* 版本紀錄（新版在最上面）。每次有感的改版就在最上方加一條 { v, date, items: [...] }。
 * ⚠️ 這一頁的文字是給老師和學生看的，全部用英文（2026-08-26 Tony 定案：雙語班，介面不要中文）。 */
window.APP_VERSIONS = [
  {
    v: "v6", date: "2026-08-26", items: [
      "Teacher code: signing in with Google is no longer enough to reach the teacher side. Each Google account has to enter the teacher code once before it can create classes or set assignments. Without it, a student could sign in as a teacher and set themselves the questions in advance.",
      "Colours and text size: the \uD83C\uDFA8 button in the top bar offers six colour themes (Ink Black, Deep Navy, Forest Green, Warm Paper, Rose Plum, Celadon) and text size from 85% to 175%. Your choice is remembered on that device.",
      "The Sign out confirmation now appears in the middle of the screen instead of at the very bottom of the page, where it was easy to miss.",
      "Setting an assignment: the question bank row no longer pushes the Add button off the right of the screen on a phone. Every row of controls now wraps neatly instead.",
      "Layout: every page has been checked at phone width, so nothing runs off the side and there is no more pinching and zooming to read a page.",
      "Typing in a box no longer zooms the whole page in on an iPhone. Every field you can type into is now at least 16px, which is the size Safari requires before it stops zooming in on you \u2014 and it never zoomed back out, which is why the right-hand side looked cut off."
    ]
  },
  {
    v: "v5", date: "2026-08-26", items: [
      "The whole interface is now in English — every button, label, message and this page. Nothing on screen is in Chinese any more.",
      "Writing tasks got their own builder. Pick \"Writing task\" when you add a question, type your own prompt, and set a word range (for example 140–190). You can build an assignment that is nothing but writing, or mix writing in with multiple choice and gap fill.",
      "Four ready-made B2 First prompts are one click away (email, article, review, essay) if you would rather start from a template than a blank box."
    ]
  },
  {
    v: "v4", date: "2026-08-26", items: [
      "Writing tasks can be marked by an AI examiner. After a student submits, one tap grades the piece against the four official Cambridge criteria (Content, Communicative Achievement, Organisation, Language) and returns an overall comment, three concrete suggestions, and up to five corrected language errors.",
      "Each piece is marked once. Coming back to it later just shows the saved feedback, so no marking quota is spent twice. The quota is counted per student, so a whole class on the same school network never blocks each other.",
      "Teachers can add their own score and comment to every writing task alongside the AI feedback. The teacher's score is the one that counts, and students see both."
    ]
  },
  {
    v: "v3", date: "2026-08-26", items: [
      "Class dashboard: the whole class on one page — how many assignments each student has handed in and their average accuracy, the submission count and class average for every assignment, overall accuracy by question type (multiple choice and gap fill), and the twenty questions the class gets wrong most often.",
      "Tap any student to see every assignment question by question: what they actually wrote, whether it was right, and the correct answer. Full writing pieces are in there too.",
      "Scores export to CSV — one row per student, one column per assignment. The file starts with a BOM so names open correctly in Excel."
    ]
  },
  {
    v: "v2", date: "2026-08-26", items: [
      "Setting assignments: pick questions from the FCE bank (Use of English Parts 1–4 and Reading), or write your own multiple choice, gap fill and writing tasks. One assignment can mix all three.",
      "Auto-marking: multiple choice and gap fill are scored the moment a student submits. Gap fill ignores capitals, stray spaces and a trailing full stop, so nobody loses a mark over punctuation. Writing tasks are flagged for marking and left out of the automatic score.",
      "Exam mode and time limits: set a time limit and \"one attempt only\". The countdown follows the time the server reports, so changing the device clock does nothing, and the paper submits itself when time runs out.",
      "Answers stay hidden: the server strips the answer key and explanations before questions reach a student, and only sends them back after submission. Teachers see who has handed in and what they scored in real time.",
      "The FCE question bank only loads when a teacher picks questions, so students never download the extra 1 MB."
    ]
  },
  {
    v: "v1", date: "2026-08-26", items: [
      "First release: teachers sign in with Google and create a class, and the system generates a 6-character class code. Students sign in with the code, their name and their seat number — no passwords.",
      "The seat number is the account: the same code and seat number on a phone, a tablet or a classroom computer is the same student, and work syncs across all of them.",
      "The roster fills itself in as students sign in, or paste \"seat number, name\" straight from a spreadsheet to bulk-import it. Once the roster is final you can lock it, and only listed seat numbers can sign in.",
      "Student and teacher credentials are completely separate — a student sign-in cannot reach anything on the teacher side."
    ]
  }
];
