//! Names for the players this client sits down at the tables.
//!
//! A handle is not an internal identifier: it is what every event line, every
//! scoreboard row and every future dashboard grid puts in front of a person, so
//! it reads as a name — `Ingrid Marchetti 1`, not `fleet-98ux-0`.
//!
//! The trailing number is what makes it unique. The module requires handles to
//! be unique across every account it has ever seen, and this client registers
//! **new** accounts on every run, so the same name does come round again — the
//! player then sits down as `Ingrid Marchetti 2`. That is [`player`]'s job, not
//! this module's: only the server can say which names are already taken.

/// 4,096 combinations, so the numbers stay low enough to read.
const FIRST: &[&str] = &[
    "Ada", "Aiko", "Alina", "Amara", "Anders", "Anita", "Arun", "Beatriz", "Bilal", "Camille",
    "Carlos", "Chidi", "Clara", "Daniel", "Dilnoza", "Dmitri", "Elena", "Emeka", "Erik", "Esther",
    "Fatima", "Felix", "Gabriel", "Greta", "Hana", "Hugo", "Ines", "Ingrid", "Ivan", "Jasmin",
    "Joachim", "Jonas", "Julia", "Kaito", "Karim", "Katya", "Klara", "Lars", "Leila", "Lucia",
    "Magnus", "Maja", "Marek", "Maria", "Mateo", "Mei", "Nadia", "Nils", "Nora", "Olga", "Omar",
    "Oscar", "Petra", "Priya", "Rafael", "Rania", "Rasmus", "Ruben", "Sanne", "Sofia", "Tariq",
    "Tomas", "Vera", "Yusuf",
];

const LAST: &[&str] = &[
    "Abadi",
    "Andersen",
    "Bakker",
    "Barros",
    "Bergman",
    "Bianchi",
    "Blomqvist",
    "Cardoso",
    "Chen",
    "Costa",
    "Dvorak",
    "Eriksen",
    "Farkas",
    "Fernandes",
    "Fischer",
    "Gallo",
    "Gomez",
    "Haddad",
    "Hassan",
    "Horvath",
    "Ibrahim",
    "Ivanov",
    "Jansen",
    "Kaur",
    "Keller",
    "Kimura",
    "Kovacs",
    "Kowalski",
    "Laurent",
    "Lindqvist",
    "Lombardi",
    "Maier",
    "Marchetti",
    "Mbeki",
    "Mendes",
    "Moreau",
    "Nakamura",
    "Navarro",
    "Nielsen",
    "Novak",
    "Okafor",
    "Olsen",
    "Ortega",
    "Pereira",
    "Petrov",
    "Popescu",
    "Rahman",
    "Ricci",
    "Rossi",
    "Sandberg",
    "Santos",
    "Schneider",
    "Silva",
    "Sokolov",
    "Sorensen",
    "Tanaka",
    "Tran",
    "Vargas",
    "Virtanen",
    "Wagner",
    "Weber",
    "Yilmaz",
    "Zahra",
    "Zielinski",
];

/// One random full name, without its number.
pub fn random_name() -> String {
    let first = FIRST[rand::random::<usize>() % FIRST.len()];
    let last = LAST[rand::random::<usize>() % LAST.len()];
    format!("{first} {last}")
}
