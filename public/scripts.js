var template = document.querySelector('textarea')
var preview = document.querySelector('.template-preview')

template.addEventListener('keyup', function (event) {
  preview.innerHTML = window.marked(template.value)
})

window.onload = function () {
  preview.innerHTML = window.marked(template.value)
}
