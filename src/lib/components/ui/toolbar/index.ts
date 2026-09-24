import Root from "./toolbar.svelte";
import { Toolbar as ToolbarPrimitive } from "bits-ui";

const ToolbarButton = ToolbarPrimitive.Button;
const ToolbarLink = ToolbarPrimitive.Link;
const ToolbarGroup = ToolbarPrimitive.Group;
const ToolbarGroupItem = ToolbarPrimitive.GroupItem;

export {
  Root,
  ToolbarButton,
  ToolbarLink,
  ToolbarGroup,
  ToolbarGroupItem,
  //
  Root as Toolbar,
};
