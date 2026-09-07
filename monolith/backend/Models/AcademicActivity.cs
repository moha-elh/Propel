using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CV_Generator.Models
{
    [Table("academic_activities")]
    public class AcademicActivity
    {
        [Key]
        public Guid Id { get; set; }
        
        [Required]
        [MaxLength(200)]
        public string Title { get; set; } = string.Empty; // e.g. "Club President", "Volunteer"
        
        public string? Organization { get; set; } // Club or school name
        [MaxLength(150)]
        public string? Role { get; set; }
        public string? Description { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime? EndDate { get; set; }
        
        [Required]
        public Guid UserId { get; set; }

        public int SortOrder { get; set; } = 0;
    }
}
