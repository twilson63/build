import build/actors/project
import build/msg
import gleam/list
import gleam/option
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event

pub fn view(state: project.State, busy: Bool) -> Element(msg.Msg) {
  case state.projects_open {
    False -> html.text("")
    True ->
      html.div(
        [attribute.class("modalBackdrop"), attribute.role("presentation")],
        [
          html.div(
            [attribute.class("modal projectModal"), attribute.role("dialog"), attribute.aria_modal(True), attribute.aria_labelledby("projects-title")],
            [
              header(),
              html.button([attribute.type_("button"), attribute.disabled(busy), event.on_click(msg.NewProject)], [html.text("+ New Project")]),
              html.div(
                [attribute.class("projectList")],
                case state.saved_projects {
                  [] -> [html.p([attribute.class("empty")], [html.text("No saved projects yet. Save this project or create a new one.")])]
                  _ -> list.map(state.saved_projects, fn(saved) { project_card(saved, state.current_project_id, busy) })
                },
              ),
            ],
          ),
        ],
      )
  }
}

fn header() {
  html.div([attribute.class("modalHeader")], [
    html.div([], [
      html.h2([attribute.id("projects-title")], [html.text("Projects")]),
      html.p([], [html.text("Saved anonymously in this browser with IndexedDB.")]),
    ]),
    html.button(
      [attribute.type_("button"), attribute.class("ghost iconButton"), attribute.aria_label("Close projects"), event.on_click(msg.Project(project.ProjectsDialogClosed))],
      [html.text("×")],
    ),
  ])
}

fn project_card(saved: project.SavedProject, current_project_id: option.Option(String), busy: Bool) {
  html.article([attribute.class("projectCard")], [
    html.div([], [
      html.strong([], [html.text(saved.name)]),
      html.small([], [html.text("Updated " <> saved.updated_at <> current_marker(saved.id, current_project_id))]),
    ]),
    html.div([attribute.class("projectActions")], [
      html.button(
        [attribute.type_("button"), attribute.class("secondary compact"), attribute.disabled(busy), event.on_click(msg.OpenProject(saved.id))],
        [html.text("Open")],
      ),
      html.button(
        [attribute.type_("button"), attribute.class("ghost compact"), attribute.disabled(busy), event.on_click(msg.RemoveProject(saved.id))],
        [html.text("Delete")],
      ),
    ]),
  ])
}

fn current_marker(id: String, current_project_id: option.Option(String)) -> String {
  case current_project_id {
    option.Some(current) if current == id -> " · current"
    _ -> ""
  }
}
