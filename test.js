function calculateTotal(items) {
  var total = 0;
  for(var i=0; i<items.length; i++) {
    total += items[i].price;
  }
  return total;
}
