# @ohif/extension-vtk-3d

![npm (scoped)](https://img.shields.io/npm/v/@ohif/extension-vtk.svg?style=flat-square)

<!-- TODO: Simple image or GIF? -->

#### Index

Extension Id: `vtk-3d`

- [Commands Module](#commands-module)
- [Toolbar Module](#toolbar-module)
- [Viewport Module](#viewport-module)

## Commands Module

| Command Name           | Description | Store Contexts |
| ---------------------- | ----------- | -------------- |
| `view3D`               |             | viewports      |

## Toolbar Module

All use the `ACTIVE_VIEWPORT::VTK-3D` context.

## Viewport Module

Our Viewport wraps [OHIF/react-vtkjs-viewport][react-viewport] and is connected
the redux store. This module is the most prone to change as we hammer out our
Viewport interface.

## Resources

### Repositories

- [OHIF/react-vtkjs-viewport][react-viewport]

<!--
  Links
  -->

<!-- prettier-ignore-start -->
[react-viewport]: https://github.com/OHIF/react-vtkjs-viewport
<!-- prettier-ignore-end -->
