import SwiftUI
import WallyCore

/// `event-detour.tsx`: fictional sample events only.
struct EventDetourView: View {
  @Environment(AppModel.self) private var model
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text("Event detours").wallyText(17, .semibold, .ink, tracking: -0.4).padding(.top, 10)
      Text("Fictional sample events, not real listings.").wallyText(11, .regular, Color(hex: 0x84907a)).padding(.top, 9)
      Button(action: model.findDetours) {
        HStack { Text(model.detourLoading ? "Checking the extra walk…" : "Find sample event detours"); Spacer(); Image(systemName: "arrow.right").font(.system(size: 14)) }
          .wallyText(11, .regular, .forest).padding(12).card(border: Color(hex: 0xbac7a8), radius: 8)
      }.buttonStyle(PressStyle()).disabled(model.detourLoading).padding(.top, 15)
      if !model.detourError.isEmpty { Text(model.detourError).wallyText(11, .regular, Color(hex: 0x99764c)).lineSpacing(4).padding(.top, 9) }
      ForEach(model.detours) { option in
        VStack(alignment: .leading, spacing: 0) {
          Text("SAMPLE EVENT").wallyText(7, .regular, Color(hex: 0x9d7a48), tracking: 0.8)
          Text(option.event.name).wallyText(12, .semibold).padding(.top, 5)
          Text(option.event.description).wallyText(11, .regular, Color(hex: 0x84907a)).lineSpacing(4).padding(.top, 9)
          Label("+\(option.additionalMinutes) min · \(kilometres(option.additionalDistanceMeters)) extra", systemImage: "clock").labelStyle(StatLabel()).wallyText(11).padding(.top, 12)
          Text("Simulated arrival: \(option.arrivalTime.formatted(date: .omitted, time: .shortened)) · \(option.event.visitMinutes) min visit").wallyText(10, .regular, .muted).padding(.top, 8)
          if model.preview?.id == option.id {
            VStack(alignment: .leading, spacing: 0) {
              Text("Updated walk: \(option.route.totalMinutes) min total · \(kilometres(option.route.distanceMeters))").wallyText(10, .semibold, .forest).padding(.bottom, 10)
              PrimaryButton(action: model.acceptDetour) { Text("Add this detour") }
              Button("Cancel preview") { model.preview = nil }.wallyText(11, .semibold, .forest).padding(.vertical, 8)
            }.padding(.top, 12)
          } else {
            Button { model.preview = option } label: { HStack(spacing: 5) { Text("Preview updated route"); Image(systemName: "arrow.right").font(.system(size: 11)) }.wallyText(11, .semibold, .forest) }
              .buttonStyle(PressStyle()).padding(.top, 8)
          }
        }
        .padding(.top, 18).overlay(alignment: .top) { Rectangle().fill(Color(hex: 0xdce3ce)).frame(height: 1) }.padding(.top, 17)
      }
    }
    .padding(.vertical, 23).padding(.horizontal, 24).frame(maxWidth: .infinity, alignment: .leading)
    .background(Color(hex: 0xf0f2e8)).overlay(alignment: .top) { Rectangle().fill(Color.line).frame(height: 1) }
  }
}
