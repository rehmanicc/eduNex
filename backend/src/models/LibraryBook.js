const mongoose=require('mongoose');
const schema=new mongoose.Schema({
 collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
 bookCode:{type:String,trim:true,index:true}, isbn:{type:String,trim:true}, title:{type:String,required:true,trim:true,index:true},
 authors:{type:[String],default:[]}, publisher:{type:String,trim:true}, edition:{type:String,trim:true}, publicationYear:Number,
 pages:{type:Number,min:0}, category:{type:String,trim:true,index:true}, subject:{type:String,trim:true}, language:{type:String,trim:true,default:'English'},
 rack:{type:String,trim:true}, shelf:{type:String,trim:true}, shelfLocation:{type:String,trim:true}, description:String, coverUrl:String,
 isActive:{type:Boolean,default:true,index:true}
},{timestamps:true});
schema.index({collegeId:1,bookCode:1},{unique:true,sparse:true});
schema.index({collegeId:1,isbn:1}); schema.index({collegeId:1,title:1});
module.exports=mongoose.model('LibraryBook',schema);
