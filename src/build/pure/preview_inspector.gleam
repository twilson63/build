import gleam/float
import gleam/list
import gleam/string

pub type BoundingRect {
  BoundingRect(x: Float, y: Float, width: Float, height: Float)
}

pub type SelectedPreviewElement {
  SelectedPreviewElement(
    tag_name: String,
    id: String,
    classes: List(String),
    text_content: String,
    outer_html: String,
    bounding_rect: BoundingRect,
    computed_styles: List(#(String, String)),
  )
}

pub fn summarize_selected_element(element: SelectedPreviewElement) -> String {
  let tag = string.lowercase(element.tag_name)
  let id = case element.id {
    "" -> ""
    _ -> "#" <> element.id
  }
  let class_name = case element.classes {
    [first, ..] -> "." <> first
    [] -> ""
  }
  tag <> id <> class_name
}

pub fn build_selected_element_prompt(comment: String, element: SelectedPreviewElement) -> String {
  "Improve the selected preview element based on the user's comment.\n\n"
  <> "User comment:\n"
  <> comment
  <> "\n\nSelected rendered element:\n"
  <> "Summary: " <> summarize_selected_element(element) <> "\n"
  <> "Tag: " <> element.tag_name <> "\n"
  <> "ID: " <> fallback(element.id) <> "\n"
  <> "Classes: " <> fallback(string.join(element.classes, " ")) <> "\n"
  <> "Text: " <> fallback(element.text_content) <> "\n"
  <> "Bounds: " <> bounding_rect_to_string(element.bounding_rect) <> "\n"
  <> "Computed styles: " <> computed_styles_to_string(element.computed_styles) <> "\n"
  <> "Outer HTML:\n"
  <> element.outer_html
  <> "\n\nUpdate the source files that render and style this selected element. Preserve the Build inspector import and src/build-inspector.ts."
}

fn fallback(value: String) -> String {
  case value {
    "" -> "(none)"
    _ -> value
  }
}

fn bounding_rect_to_string(rect: BoundingRect) -> String {
  "{\"x\":" <> number_to_string(rect.x) <> ",\"y\":" <> number_to_string(rect.y) <> ",\"width\":" <> number_to_string(rect.width) <> ",\"height\":" <> number_to_string(rect.height) <> "}"
}

fn computed_styles_to_string(styles: List(#(String, String))) -> String {
  let entries =
    styles
    |> list.map(fn(pair) { "\"" <> pair.0 <> "\":\"" <> pair.1 <> "\"" })
    |> string.join(",")
  "{" <> entries <> "}"
}

fn number_to_string(value: Float) -> String {
  float.to_string(value)
}
