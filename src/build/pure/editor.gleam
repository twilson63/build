import gleam/string

pub type Language {
  Json
  Html
  Css
  TypeScript(jsx: Bool)
  JavaScript(jsx: Bool)
}

pub fn language_for_path(path: String) -> Result(Language, Nil) {
  let lower = string.lowercase(path)
  case string.ends_with(lower, ".json") {
    True -> Ok(Json)
    False -> case string.ends_with(lower, ".html") {
      True -> Ok(Html)
      False -> case string.ends_with(lower, ".css") {
        True -> Ok(Css)
        False -> case string.ends_with(lower, ".tsx") {
          True -> Ok(TypeScript(jsx: True))
          False -> case string.ends_with(lower, ".ts") {
            True -> Ok(TypeScript(jsx: False))
            False -> case string.ends_with(lower, ".jsx") {
              True -> Ok(JavaScript(jsx: True))
              False -> case string.ends_with(lower, ".js") {
                True -> Ok(JavaScript(jsx: False))
                False -> Error(Nil)
              }
            }
          }
        }
      }
    }
  }
}

pub fn has_language_extension(path: String) -> Bool {
  case language_for_path(path) {
    Ok(_) -> True
    Error(_) -> False
  }
}
